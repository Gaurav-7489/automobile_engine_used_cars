import { medianOf } from "../finance";
import { getMonths } from "../time";
import type { SqlClient } from "./db";
import { funnelSql, listSales, movementSql, salesSummarySql, stockMetricsSql, todayIst } from "./read-queries";

/** Everything the Capital page's figures, charts and ledger need, aggregated in the database for the member's branches. */
export async function capitalData(c: SqlClient, tenantId: string, branchIds: string[], from: string, to: string, cost?: "complete" | "incomplete") {
  const months = getMonths();
  const [metrics, summary, completed, excluded] = await Promise.all([
    stockMetricsSql(c, tenantId, branchIds, todayIst(), cost),
    salesSummarySql(c, tenantId, branchIds, from, to),
    listSales(c, tenantId, branchIds, from, to, 1, 200, "Completed"),
    listSales(c, tenantId, branchIds, from, to, 1, 200, "NotCompleted"),
  ]);
  const done = summary.filter((r) => r.state === "Completed");
  const realized = { count: done.reduce((a, r) => a + r.count, 0), profit: done.reduce((a, r) => a + r.profit, 0), medianDaysToSale: medianOf(done.flatMap((r) => r.days)), excluded: summary.filter((r) => r.state !== "Completed").reduce((a, r) => a + r.count, 0) };
  const monthly = months.map((month) => ({ month, count: done.filter((r) => r.month === month).reduce((a, r) => a + r.count, 0), profit: done.filter((r) => r.month === month).reduce((a, r) => a + r.profit, 0) }));
  return { metrics, realized, monthly, ledger: { completed: completed.sales, completedTotal: completed.total, excluded: excluded.sales, excludedTotal: excluded.total } };
}

const inRange = (months: readonly string[], from: string, to: string) => months.filter((m) => m >= from && m <= to);

/** The Reports page: per-month acquisitions, sales and realized profit, the lead funnel for leads created in the period, stock metrics and the comparison period. */
export async function reportsData(c: SqlClient, tenantId: string, branchIds: string[], from: string, to: string, compare: string) {
  const all = getMonths();
  const months = inRange(all, from, to);
  const [movement, summary, funnel, metrics] = await Promise.all([
    movementSql(c, tenantId, branchIds, months), salesSummarySql(c, tenantId, branchIds, from, to), funnelSql(c, tenantId, branchIds, months), stockMetricsSql(c, tenantId, branchIds, todayIst()),
  ]);
  const profitOf = (m: string) => summary.filter((r) => r.state === "Completed" && r.month === m).reduce((a, r) => a + r.profit, 0);
  const rows = months.map((month, i) => ({ month, acquired: movement[i].acquired, sold: movement[i].sold, profit: profitOf(month) }));
  const idx = all.indexOf(from);
  let prior: { acquired: number; sold: number } | null = null;
  if (compare !== "none" && compare !== "yoy" && idx - months.length >= 0 && idx >= 0) {
    const prev = await movementSql(c, tenantId, branchIds, all.slice(idx - months.length, idx));
    const inPeriodEvents = rows.reduce((a, r) => a + r.acquired + r.sold, 0);
    prior = { acquired: inPeriodEvents ? prev.reduce((a, r) => a + r.acquired, 0) : 0, sold: prev.reduce((a, r) => a + r.sold, 0) };
  }
  return { rows, funnel, metrics, prior };
}

export type DrillKind = "acquired" | "sold" | "profit" | "qualified";

export async function reportDrill(c: SqlClient, tenantId: string, branchIds: string[], months: string[], kind: DrillKind) {
  if (kind === "acquired") {
    const rows = (await c.query("SELECT stock_id, data->>'make' AS make, data->>'model' AS model, data->>'acquiredAt' AS at FROM intelligence_vehicle_index WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[]) AND to_char(acquired_day, 'YYYY-MM') = ANY($3::text[]) ORDER BY acquired_day DESC, stock_id COLLATE \"C\" LIMIT 500", [tenantId, branchIds, months])).rows;
    const total = Number((await c.query("SELECT count(*)::int AS n FROM intelligence_vehicle_index WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[]) AND to_char(acquired_day, 'YYYY-MM') = ANY($3::text[])", [tenantId, branchIds, months])).rows[0].n);
    return { rows: rows.map((r) => ({ ref: String(r.stock_id), label: `${r.make} ${r.model}`, at: String(r.at) })), total };
  }
  if (kind === "qualified") {
    const rows = (await c.query("SELECT lead_id, data->>'name' AS name, stage FROM intelligence_lead_index WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[]) AND to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') = ANY($3::text[]) AND stage NOT IN ('New', 'Contacted', 'Nurture', 'Lost') ORDER BY lead_id COLLATE \"C\" LIMIT 500", [tenantId, branchIds, months])).rows;
    const total = Number((await c.query("SELECT count(*)::int AS n FROM intelligence_lead_index WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[]) AND to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') = ANY($3::text[]) AND stage NOT IN ('New', 'Contacted', 'Nurture', 'Lost')", [tenantId, branchIds, months])).rows[0].n);
    return { rows: rows.map((r) => ({ ref: String(r.lead_id), label: String(r.name), stage: String(r.stage) })), total };
  }
  const sales = await listSales(c, tenantId, branchIds, months[0] ?? "9999-99", months[months.length - 1] ?? "0000-00", 1, 200, "Completed");
  return { rows: sales.sales, total: sales.total };
}
