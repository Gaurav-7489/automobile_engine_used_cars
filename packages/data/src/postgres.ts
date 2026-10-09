import { Pool, type PoolConfig } from "pg";
import { readFileSync } from "node:fs";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

export interface SqlClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  release(): void;
}
export interface SqlPool { connect(): Promise<SqlClient> }
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
  const max=Number(env.DATABASE_POOL_MAX??(env.VERCEL==="1"?"2":"10"));
  if(!Number.isInteger(max)||max<1||max>50)throw new Error("DATABASE_POOL_MAX must be between 1 and 50.");
  return {connectionString,host:env.DATABASE_HOST||credentials.host,database:env.DATABASE_NAME||credentials.dbname,
    user:credentials.username,password:credentials.password,port:Number(env.DATABASE_PORT||credentials.port||5432),
    ssl:tls?{rejectUnauthorized:true,ca:env.DATABASE_SSL_CA|| (env.DATABASE_SSL_CA_FILE?readFileSync(env.DATABASE_SSL_CA_FILE,"utf8"):undefined)}:false,
    max,connectionTimeoutMillis:5000,idleTimeoutMillis:30000,statement_timeout:15000,application_name:"vandlabs-automobile-engine"};
}
export function databasePool(): Promise<SqlPool> {
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
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const role = (await client.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")).rows[0];
    if (!role || role.rolsuper || role.rolbypassrls) throw new Error("Application database role must not bypass RLS.");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export { Pool } from "pg";
