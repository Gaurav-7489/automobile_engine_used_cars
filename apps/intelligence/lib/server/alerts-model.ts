import { reopenExpired } from "../actions/alerts";
import { deriveAlerts } from "../alerts-derive";
import type { Alert, Lead, Vehicle } from "../domain";
import type { WorkspaceState } from "../state";
import type { SqlClient } from "./db";
import { enquiryContext } from "./read-queries";

/**
 * Alerts are derived from records and policy, never stored wholesale. The derivation only ever looks at unsold stock, open
 * leads, pending requests and the persisted alert documents, so only those are loaded; the result is identical to deriving
 * from the whole workspace (verified in tests/intelligence-prod/read-model.test.ts).
 */
const TTL_MS = 15_000;
const cache = new Map<string, { at: number; alerts: Alert[] }>();

/** Called after any write for the tenant so the next read re-derives. */
export const invalidateAlerts = (tenantId: string): void => { for (const key of cache.keys()) if (key.startsWith(`${tenantId}|`)) cache.delete(key); };

export async function deriveTenantAlerts(c: SqlClient, tenantId: string, shell: WorkspaceState, nowIso = new Date().toISOString()): Promise<Alert[]> {
  const key = `${tenantId}|${shell.policy.rulesVersion}|${JSON.stringify(shell.policy)}|${shell.priceRequests.length}|${shell.campaigns.length}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.alerts;
  const referenced = [...new Set([...shell.priceRequests.filter((r) => r.status === "Pending").map((r) => r.vehicleId), ...shell.campaigns.filter((x) => x.status === "Pending").map((x) => x.vehicleId)])];
  const ctx = await enquiryContext(c, tenantId);
  const vehicleRows = (await c.query(
    "SELECT data FROM intelligence_vehicle_index WHERE tenant_id = $1 AND (status NOT IN ('sold', 'archived') OR stock_id = ANY($2::text[]))", [tenantId, referenced])).rows as { data: Vehicle }[];
  const leadRows = (await c.query("SELECT data FROM intelligence_lead_index WHERE tenant_id = $1 AND stage NOT IN ('Won', 'Lost')", [tenantId])).rows as { data: Lead }[];
  const persisted = (await c.query("SELECT payload FROM intelligence_documents WHERE tenant_id = $1 AND collection = 'alerts'", [tenantId])).rows as { payload: Alert }[];
  const partial: WorkspaceState = {
    ...shell,
    vehicles: vehicleRows.map((r) => ({ ...r.data, enquiries14d: ctx.byStock.get(r.data.id) ?? 0, cohortMedianEnquiries: ctx.median })),
    leads: leadRows.map((r) => r.data),
    alerts: persisted.map((r) => r.payload),
  };
  const alerts = reopenExpired({ ...partial, alerts: deriveAlerts(partial, nowIso) }).alerts;
  cache.set(key, { at: Date.now(), alerts });
  return alerts;
}
