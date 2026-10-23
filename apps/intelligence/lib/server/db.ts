import { databasePool, tenantTransaction, type SqlClient, type SqlPool } from "@vandlabs/data/postgres";

export type { SqlClient, SqlPool };

let override: SqlPool | undefined;

/** Tests inject an in-process PostgreSQL; production uses the shared pooled application-role connection. */
export function setTestPool(pool: SqlPool | undefined): void {
  override = pool;
}

export function pool(): Promise<SqlPool> {
  return override ? Promise.resolve(override) : databasePool();
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && uuid.test(value);

/** Runs inside one transaction with the tenant set for row-level security. The application role must not bypass RLS. */
export async function tenantTx<T>(tenantId: string, action: (client: SqlClient) => Promise<T>): Promise<T> {
  return tenantTransaction(await pool(), tenantId, action);
}

/** Pre-tenant operations (sign-in, token redemption) call SECURITY DEFINER functions only. */
export async function plain<T>(action: (client: SqlClient) => Promise<T>): Promise<T> {
  const client = await (await pool()).connect();
  try {
    return await action(client);
  } finally {
    client.release();
  }
}
