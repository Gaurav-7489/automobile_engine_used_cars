import { Pool, type PoolConfig } from "pg";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

export interface SqlClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  /** Passing an error discards the connection instead of returning it to the pool. */
  release(error?: Error | boolean): void;
}
export interface SqlPool { connect(): Promise<SqlClient> }

/** Failures to reach the server (a serverless database waking up, a dropped socket), as opposed to errors from a statement. */
export function isTransientConnectionError(error: unknown): boolean {
  const e = error as { message?: unknown; code?: unknown } | null;
  const code = typeof e?.code === "string" ? e.code : "";
  const message = typeof e?.message === "string" ? e.message : "";
  return ["08000", "08001", "08003", "08006", "08P01", "57P01", "57P03", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE"].includes(code)
    || /timeout exceeded when trying to connect|connection terminated|server conn crashed|connection timeout|terminating connection/i.test(message);
}
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Opens a connection, retrying briefly while the server is unreachable. Nothing has run on it yet, so a retry can never repeat a write. */
export async function connectClient(pool: SqlPool, attempts = 3): Promise<SqlClient> {
  for (let attempt = 1; ; attempt++) {
    try { return await pool.connect(); }
    catch (error) { if (attempt >= attempts || !isTransientConnectionError(error)) throw error; await pause(400 * attempt); }
  }
}
export async function databaseSecret(arn:string):Promise<Record<string,string>> {
  const result = await new SecretsManagerClient({}).send(new GetSecretValueCommand({SecretId:arn}));
  if(!result.SecretString)throw new Error("Database credentials unavailable.");return JSON.parse(result.SecretString);
}
let poolPromise: Promise<SqlPool> | undefined;
export function databaseOptions(env:Record<string,string|undefined>=process.env,credentials:Record<string,string>={}):PoolConfig {
  const tls=env.DATABASE_TLS!=="off";
  if(!tls&&env.NODE_ENV==="production")throw new Error("Database TLS is required.");
  let connectionString=env.DATABASE_URL;
  if(connectionString) {
    let url:URL;try{url=new URL(connectionString);}catch{throw new Error("Invalid database connection configuration.");}
    if(!["postgres:","postgresql:"].includes(url.protocol))throw new Error("Invalid database connection configuration.");
    // pg URL parameters override the ssl object, including its verification/CA options.
    for(const key of [...url.searchParams.keys()])if(/^ssl/i.test(key)||key==="uselibpqcompat")url.searchParams.delete(key);
    connectionString=url.toString();
  }
  if(!connectionString&&!credentials.password)throw new Error("Database connection is not configured.");
  const max=Number(env.DATABASE_POOL_MAX??(env.VERCEL==="1"||env.HOSTING_PROVIDER==="cloudflare"?"5":"10"));
  if(!Number.isInteger(max)||max<1||max>50)throw new Error("DATABASE_POOL_MAX must be between 1 and 50.");
  return {connectionString,host:env.DATABASE_HOST||credentials.host,database:env.DATABASE_NAME||credentials.dbname,
    user:credentials.username,password:credentials.password,port:Number(env.DATABASE_PORT||credentials.port||5432),
    ssl:tls?{rejectUnauthorized:true,ca:env.DATABASE_SSL_CA|| (env.DATABASE_SSL_CA_FILE?readFileSync(env.DATABASE_SSL_CA_FILE,"utf8"):undefined)}:false,
    // Serverless instances sleep between requests and sockets can die silently while they do. A short connect timeout lets
    // connectClient's retries replace a stuck attempt in seconds (3 x 5 s still covers a database waking up) instead of
    // waiting 15 s per attempt; keep-alive and a short idle window stop dead sockets lingering in the pool.
    max,connectionTimeoutMillis:Number(env.DATABASE_CONNECT_TIMEOUT_MS??5000),idleTimeoutMillis:10000,keepAlive:true,statement_timeout:15000,application_name:"vandlabs-automobile-engine"};
}
export function databasePool(): Promise<SqlPool> {
  if (process.env.HOSTING_PROVIDER === "cloudflare") {
    if (process.env.DATABASE_SECRET_ARN) throw new Error("Use a Worker DATABASE_URL secret on Cloudflare.");
    const options = databaseOptions();
    const url = new URL(options.connectionString!);
    if (!url.hostname.endsWith(".neon.tech") || !url.hostname.includes("-pooler.")) throw new Error("Cloudflare requires a pooled Neon application-role URL.");
    neonConfig.webSocketConstructor = WebSocket;
    // One connection per tenant transaction; close within the originating request.
    // Neon PgBouncer bounds backend connections across all Worker isolates.
    return Promise.resolve({ async connect() {
      const pool = new NeonPool({...options, max: 1});
      pool.on("error",()=>console.error(JSON.stringify({event:"database_connection_failure"})));
      try {
        const client = await pool.connect();
        return {query: (sql:string, values?:unknown[]) => client.query(sql, values),
          release() { client.release(); void pool.end().catch(() => undefined); }};
      } catch (error) { await pool.end().catch(() => undefined); throw error; }
    }});
  }
  return poolPromise ??= (async () => {
    let credentials: Record<string, string> = {};
    if (process.env.DATABASE_SECRET_ARN) {
      credentials = await databaseSecret(process.env.DATABASE_SECRET_ARN);
    }
    const pool=new Pool(databaseOptions(process.env,credentials));
    // Handle idle network failures without logging connection strings/credentials.
    pool.on("error",()=>{console.error("Database pool connection unavailable.");});
    return pool;
  })().catch((error) => { poolPromise = undefined; throw error; });
}
export function migrationPool() {
  if(!process.env.MIGRATION_DATABASE_URL)throw new Error("Migration connection is required.");
  return new Pool({...databaseOptions({...process.env,DATABASE_URL:process.env.MIGRATION_DATABASE_URL,DATABASE_POOL_MAX:"1"}),application_name:"vandlabs-migrations"});
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function tenantTransaction<T>(pool: SqlPool, tenantId: string, action: (client: SqlClient) => Promise<T>): Promise<T> {
  if (!uuid.test(tenantId)) throw new Error("Invalid tenant identifier.");
  // BEGIN is safe to repeat: a pooled connection that died while idle is discarded and a fresh one opened.
  let client: SqlClient;
  for (let attempt = 1; ; attempt++) {
    client = await connectClient(pool);
    try { await client.query("BEGIN"); break; }
    catch (error) { client.release(error as Error); if (attempt >= 2 || !isTransientConnectionError(error)) throw error; }
  }
  try {
    // One statement sets the tenant and reads the role's flags: a round trip saved on every request.
    const role = (await client.query("SELECT set_config('app.tenant_id', $1, true) AS tenant, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user", [tenantId])).rows[0];
    if (!role || role.rolsuper || role.rolbypassrls) throw new Error("Application database role must not bypass RLS.");
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export { Pool } from "pg";
