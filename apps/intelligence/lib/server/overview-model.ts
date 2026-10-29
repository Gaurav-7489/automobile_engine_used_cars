import type { Alert, InventoryEvent, Lead, Vehicle } from "../domain";
import { alertCounts, sortAlerts } from "../selectors";
import { getMonths } from "../time";
import { deriveTenantAlerts } from "./alerts-model";
import type { SqlClient } from "./db";
import { movementSql, stockMetricsSql } from "./read-queries";
import { readState } from "./workspace-store";

/** Open alerts for the member's branches, highest severity first. Derived from the records that can raise them, never from the whole workspace. */
export async function scopedAlerts(c: SqlClient, tenantId: string, branchIds: string[]): Promise<Alert[]> {
  const shell = await readState(c, tenantId, { shell: true });
  return (await deriveTenantAlerts(c, tenantId, shell)).filter((a) => branchIds.includes(a.branchId));
}

export async function overviewData(c: SqlClient, tenantId: string, branchIds: string[]) {
  const [metrics, movement, alerts] = await Promise.all([stockMetricsSql(c, tenantId, branchIds), movementSql(c, tenantId, branchIds, getMonths()), scopedAlerts(c, tenantId, branchIds)]);
  const hasStock = Number((await c.query("SELECT count(*)::int AS n FROM intelligence_vehicle_index WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[])", [tenantId, branchIds])).rows[0]?.n ?? 0) > 0;
  const queue = sortAlerts(alerts.filter((a) => a.status === "Open" && !a.waiting && a.severity !== "Info"));
  const shown = queue.slice(0, 200);
  // The records the queue refers to, so each row can be labelled without the browser holding every vehicle and lead.
  const vehicleRefs = shown.filter((a) => a.recordKind === "vehicle").map((a) => a.recordRef);
  const leadRefs = shown.filter((a) => a.recordKind === "lead").map((a) => a.recordRef);
  const vehicles = vehicleRefs.length ? (await c.query("SELECT data FROM intelligence_vehicle_index WHERE tenant_id = $1 AND stock_id = ANY($2::text[])", [tenantId, vehicleRefs])).rows.map((r) => r.data as Vehicle) : [];
  const leads = leadRefs.length ? (await c.query("SELECT data FROM intelligence_lead_index WHERE tenant_id = $1 AND lead_id = ANY($2::text[])", [tenantId, leadRefs])).rows.map((r) => r.data as Lead) : [];
  return { metrics, movement, hasStock, alerts: shown, alertTotal: queue.length, alertCounts: alertCounts(alerts), records: { vehicles, leads } };
}

/** Acquisitions and completed sales that make up one month's bar. */
export async function eventsForMonthSql(c: SqlClient, tenantId: string, branchIds: string[], month: string, type?: "acquired" | "sold"): Promise<InventoryEvent[]> {
  const out: InventoryEvent[] = [];
  if (!type || type === "acquired") {
    const rows = (await c.query("SELECT stock_id, branch_id, data FROM intelligence_vehicle_index WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[]) AND to_char(acquired_day, 'YYYY-MM') = $3 ORDER BY stock_id COLLATE \"C\" LIMIT 500", [tenantId, branchIds, month])).rows as { stock_id: string; branch_id: string; data: Vehicle }[];
    for (const r of rows) out.push({ id: `ev-a-${r.stock_id}`, branchId: r.branch_id, type: "acquired", at: r.data.acquiredAt, label: `${r.data.make} ${r.data.model}`, ref: r.stock_id });
  }
  if (!type || type === "sold") {
    const rows = (await c.query(
      `SELECT s.sale_id, s.vehicle_stock_id, s.closed_at, s.data, CASE WHEN s.from_ledger THEN COALESCE(v.branch_id, s.branch_id) ELSE s.branch_id END AS branch_id,
              CASE WHEN s.from_ledger THEN (CASE WHEN COALESCE(v.cost_complete, false) THEN 'Completed' ELSE 'Unreconciled' END) ELSE s.state END AS state
       FROM intelligence_sale_index s LEFT JOIN intelligence_vehicle_index v ON v.tenant_id = s.tenant_id AND v.stock_id = s.vehicle_stock_id
       WHERE s.tenant_id = $1 AND to_char(s.closed_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') = $3 ORDER BY s.sale_id COLLATE "C" LIMIT 500`, [tenantId, branchIds, month])).rows as { sale_id: string; vehicle_stock_id: string; closed_at: string; data: { label: string }; branch_id: string; state: string }[];
    for (const r of rows) if (r.state === "Completed" && branchIds.includes(r.branch_id)) out.push({ id: `ev-s-${r.sale_id}`, branchId: r.branch_id, type: "sold", at: new Date(r.closed_at).toISOString(), label: r.data.label, ref: r.vehicle_stock_id });
  }
  return out;
}
