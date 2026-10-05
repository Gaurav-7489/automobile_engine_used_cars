import { Pool } from "pg";
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
export function databasePool(): Promise<SqlPool> {
  return poolPromise ??= (async () => {
    const tls = process.env.DATABASE_TLS !== "off";
    if (!tls && process.env.NODE_ENV === "production") throw new Error("Database TLS is required.");
    let credentials: Record<string, string> = {};
    if (process.env.DATABASE_SECRET_ARN) {
      credentials = await databaseSecret(process.env.DATABASE_SECRET_ARN);
    }
    if (!process.env.DATABASE_URL && !credentials.password) throw new Error("Database connection is not configured.");
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      host: process.env.DATABASE_HOST || credentials.host,
      database: process.env.DATABASE_NAME || credentials.dbname,
      user: credentials.username, password: credentials.password,
      port: Number(process.env.DATABASE_PORT || credentials.port || 5432),
      ssl: tls ? { rejectUnauthorized: true, ca: process.env.DATABASE_SSL_CA_FILE ? readFileSync(process.env.DATABASE_SSL_CA_FILE, "utf8") : undefined } : false,
      max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
    });
  })().catch((error) => { poolPromise = undefined; throw error; });
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
