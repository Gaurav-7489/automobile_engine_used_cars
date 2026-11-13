import type { SqlClient } from "./db";

/** Adds one entry to the workspace audit trail (Settings → Audit), for changes made outside the command pipeline. */
export async function writeAudit(c: SqlClient, tenantId: string, actor: string, action: string, target: string, detail: string): Promise<void> {
  const stamp = new Date().toISOString();
  const id = `AU-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  await c.query(
    "INSERT INTO intelligence_documents(tenant_id, collection, id, payload, updated_at) VALUES($1,'audit',$2,$3,$4)",
    [tenantId, id, { id, at: stamp, actor, action, target, detail: detail.slice(0, 300) }, stamp]);
}
