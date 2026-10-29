import { migrationPool } from "../../packages/data/src/postgres";
import { tenantTx } from "../../apps/intelligence/lib/server/db";
import { syncReadModel } from "../../apps/intelligence/lib/server/read-model";
import { funnelSql, listLeads, listSales, listVehicles, movementSql, salesSummarySql, stockMetricsSql, todayIst } from "../../apps/intelligence/lib/server/read-queries";
import { getMonths } from "../../apps/intelligence/lib/time";

/** Median wall time of each page query against a seeded, synced tenant. */
const tenantId = process.argv[2];
const admin = migrationPool();
const branches = (await admin.query("SELECT id FROM locations WHERE tenant_id = $1", [tenantId])).rows.map((r) => String(r.id)); await admin.end();
await tenantTx(tenantId, (c) => syncReadModel(c, tenantId, { force: true }));
const day = todayIst(); const months = getMonths();
const cases: Record<string, (c: Parameters<Parameters<typeof tenantTx>[1]>[0]) => Promise<unknown>> = {
  "inventory page 1 (25, default sort)": (c) => listVehicles(c, tenantId, branches, { tab: "all", page: 1, size: 25 }, day),
  "inventory search 'kia'": (c) => listVehicles(c, tenantId, branches, { tab: "all", q: "kia", page: 1, size: 25 }, day),
  "inventory age >45 sort asking desc": (c) => listVehicles(c, tenantId, branches, { tab: "all", age: ">45", sort: "asking", dir: "desc", page: 1, size: 25 }, day),
  "inventory price-review flag": (c) => listVehicles(c, tenantId, branches, { tab: "available", flag: "review", page: 1, size: 25 }, day),
  "leads page 1 (30 days)": (c) => listLeads(c, tenantId, branches, { stage: "all", createdDays: "30", page: 1, size: 25 }),
  "leads stage Qualified (all time)": (c) => listLeads(c, tenantId, branches, { stage: "Qualified", createdDays: "all", page: 1, size: 25 }),
  "overview KPIs": (c) => stockMetricsSql(c, tenantId, branches, day),
  "overview movement": (c) => movementSql(c, tenantId, branches, months),
  "sales summary": (c) => salesSummarySql(c, tenantId, branches, months[0], months[5]),
  "sales page 1": (c) => listSales(c, tenantId, branches, "0000-00", "9999-99", 1, 25),
  "funnel": (c) => funnelSql(c, tenantId, branches),
};
const out: Record<string, number> = {};
for (const [name, fn] of Object.entries(cases)) {
  const t: number[] = [];
  for (let i = 0; i < 9; i++) { const s = performance.now(); await tenantTx(tenantId, fn); t.push(performance.now() - s); }
  t.sort((a, b) => a - b); out[name] = Math.round(t[4] * 10) / 10;
}
console.log(JSON.stringify({ tenantId, medianMs: out }, null, 1));
process.exit(0);
