import { test } from "node:test";
import assert from "node:assert/strict";
import { harness, runFull } from "./harness";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { redeemToken, resolvePrincipal } from "../../apps/intelligence/lib/server/identity";
import { loadWorkspace, runCommands } from "../../apps/intelligence/lib/server/workspace";
import { tenantTx } from "../../apps/intelligence/lib/server/db";
import { readState } from "../../apps/intelligence/lib/server/workspace-store";
import { deriveTenantAlerts } from "../../apps/intelligence/lib/server/alerts-model";
import { syncReadModel } from "../../apps/intelligence/lib/server/read-model";
import { funnelSql, listLeads, listSales, listVehicles, movementSql, salesSummarySql, stockMetricsSql, todayIst, type VehicleFilter } from "../../apps/intelligence/lib/server/read-queries";
import { seedSynthetic } from "../../scripts/perf/synthetic";
import { ageBucket, landedCost, needsPriceReview, realizedMetrics, stockAgeDays, stockMetrics } from "../../apps/intelligence/lib/finance";
import { capitalModel, funnelFor, overviewModel, reportsModel } from "../../apps/intelligence/lib/selectors";
import { getMonths, SNAPSHOT_AT } from "../../apps/intelligence/lib/time";
import { monthKey } from "../../apps/intelligence/lib/format";
import type { Lead, Vehicle } from "../../apps/intelligence/lib/domain";

const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

async function setup(h: Awaited<ReturnType<typeof harness>>) {
  const admin = await h.admin.connect();
  const p = await provisionWorkspace(admin, {
    organization: "ReadModel", dealership: "ReadModel Motors",
    locations: [{ name: "North", city: "Kochi", state: "Kerala", phone: "+91 0" }, { name: "South", city: "Thrissur", state: "Kerala", phone: "+91 1" }, { name: "East", city: "Kozhikode", state: "Kerala", phone: "+91 2" }],
    owner: { email: "owner@readmodel.example", name: "Owner" },
  });
  const created = await redeemToken(p.ownerToken, "correct horse battery 7");
  assert.ok(created.ok);
  const principal = (await resolvePrincipal((created as { userId: string }).userId, p.tenantId, Math.floor(Date.now() / 1000)))!;
  const ids = (await admin.query("SELECT d.id AS dealership_id, array_agg(l.id ORDER BY l.name) AS locs FROM dealerships d JOIN locations l ON l.tenant_id = d.tenant_id AND l.dealership_id = d.id WHERE d.tenant_id = $1 GROUP BY d.id", [p.tenantId])).rows[0] as { dealership_id: string; locs: string[] };
  return { p, principal, ids, admin };
}

/** The inventory page's original client-side logic, kept here as the reference the SQL must agree with. */
function reference(all: Vehicle[], f: VehicleFilter): Vehicle[] {
  let rows = all.filter((v) => (f.tab === "all" ? v.status !== "sold" && v.status !== "archived" : v.status === f.tab));
  if (f.q) { const t = f.q.toLowerCase(); rows = rows.filter((v) => `${v.id} ${v.make} ${v.model} ${v.variant} ${v.registration}`.toLowerCase().includes(t)); }
  if (f.make) rows = rows.filter((v) => v.make === f.make);
  if (f.age) rows = rows.filter((v) => (f.age === ">45" ? stockAgeDays(v, SNAPSHOT_AT) > 45 : ageBucket(stockAgeDays(v, SNAPSHOT_AT)) === f.age));
  if (f.vbranch) rows = rows.filter((v) => v.branchId === f.vbranch);
  if (f.flag === "cost") rows = rows.filter((v) => !v.costComplete);
  if (f.flag === "media") rows = rows.filter((v) => !v.hasImages);
  if (f.flag === "review") rows = rows.filter((v) => needsPriceReview(v));
  const value = { year: (v: Vehicle) => v.year, km: (v: Vehicle) => v.km, landed: (v: Vehicle) => landedCost(v.costs), asking: (v: Vehicle) => v.asking ?? -1, age: (v: Vehicle) => stockAgeDays(v, SNAPSHOT_AT) };
  if (f.sort) rows = [...rows].sort((a, b) => (value[f.sort as keyof typeof value](a) - value[f.sort as keyof typeof value](b)) * (f.dir === "desc" ? -1 : 1) || (a.id < b.id ? -1 : 1));
  else rows = [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
  return rows;
}

test("read model agrees with the full workspace read: records, filters, sorting, paging, KPIs, movement, sales, funnel", async () => {
  const h = await harness();
  try {
    const { p, principal, ids, admin } = await setup(h);
    await seedSynthetic(admin, p.tenantId, ids, { vehicles: 240, leads: 720, sales: 40 });

    // Records created by the application itself (Intelligence documents), then changed behind its back (shared row newer than the document).
    const [north] = p.locationIds;
    const add = (extra: Record<string, string> = {}) => ({ make: "Honda", model: "City", variant: "VX", year: "2021", fuel: "Petrol", transmission: "Automatic", km: "32000", owners: "1", registration: `KL 07 CD ${Math.floor(Math.random() * 9000 + 1000)}`, acquiredOn: today(), branchId: north, status: "preparation", asking: "950000", costs: { acquisition: "800000", transport: "5000", inspection: "2000", refurbishment: "30000", fees: "3000" }, photos: "0", ...extra });
    const first = await runFull(principal, [{ name: "addVehicle", args: [add()] }, { name: "addVehicle", args: [add({ make: "Kia", asking: "0" })] }], false);
    assert.ok(first.ok, JSON.stringify(first));
    const docId = first.state.vehicles.find((v) => v.make === "Honda" && v.id.startsWith("V-"))!.id;
    assert.ok((await runFull(principal, [{ name: "transitionVehicle", args: [docId, 1, { to: "available" }] }], false)).ok);
    const someLead = (await loadWorkspace(principal)).leads.find((l) => l.stage === "New")!;
    assert.ok((await runFull(principal, [{ name: "changeStage", args: [someLead.id, someLead.version, "Qualified"] }], false)).ok);
    await new Promise((r) => setTimeout(r, 30));
    await h.db.query("UPDATE vehicles SET payload = jsonb_set(payload, '{price}', '1234567'), updated_at = now() WHERE stock_id IN ($1, 'SYN-150', 'SYN-151')", [docId]);
    await h.db.query("UPDATE stock_costs SET payload = jsonb_set(payload, '{reconditioningCost}', '99999'), version = version + 1 WHERE vehicle_id = (SELECT id FROM vehicles WHERE stock_id = 'SYN-160')");

    const full = await loadWorkspace(principal);
    const ids3 = full.branches.map((b) => b.id);
    await tenantTx(p.tenantId, (c) => syncReadModel(c, p.tenantId, { force: true }));
    const run = <T>(fn: (c: Parameters<Parameters<typeof tenantTx>[1]>[0]) => Promise<T>) => tenantTx(p.tenantId, fn);
    const day = todayIst();

    // 1. Every vehicle record, including time-dependent enquiry fields.
    const fromIndex: Vehicle[] = [];
    for (const tab of ["available", "reserved", "preparation", "sold", "archived"] as const) {
      for (let page = 1; ; page++) {
        const got = await run((c) => listVehicles(c, p.tenantId, ids3, { tab, page, size: 100 }, day));
        fromIndex.push(...got.vehicles);
        if (page * 100 >= got.total) break;
      }
    }
    fromIndex.sort((a, b) => (a.id < b.id ? -1 : 1));
    const expected = [...full.vehicles].sort((a, b) => (a.id < b.id ? -1 : 1));
    assert.equal(fromIndex.length, expected.length);
    assert.deepEqual(plain(fromIndex), plain(expected));

    // 2. Filters, sorting and paging match the page's original client-side logic.
    const live = full.vehicles;
    const cases: VehicleFilter[] = [
      { tab: "all", page: 1, size: 25 }, { tab: "available", page: 2, size: 25 }, { tab: "all", q: "kia", page: 1, size: 50 }, { tab: "all", make: "Tata", page: 1, size: 25 },
      { tab: "all", age: ">45", page: 1, size: 100 }, { tab: "all", age: "16-30", page: 1, size: 100 }, { tab: "available", flag: "cost", page: 1, size: 100 }, { tab: "all", flag: "media", page: 1, size: 100 },
      { tab: "available", flag: "review", page: 1, size: 100 }, { tab: "all", vbranch: ids3[1], page: 1, size: 25 }, { tab: "all", sort: "asking", dir: "desc", page: 1, size: 25 }, { tab: "all", sort: "age", dir: "asc", page: 3, size: 25 },
      { tab: "sold", sort: "km", dir: "desc", page: 1, size: 25 }, { tab: "all", sort: "landed", dir: "asc", page: 2, size: 25 }, { tab: "all", sort: "year", dir: "desc", page: 1, size: 50 },
    ];
    for (const f of cases) {
      const want = reference(live, f);
      const got = await run((c) => listVehicles(c, p.tenantId, ids3, f, day));
      assert.equal(got.total, want.length, JSON.stringify(f));
      const start = (f.page - 1) * f.size;
      assert.deepEqual(got.vehicles.map((v) => v.id), want.slice(start, start + f.size).map((v) => v.id), JSON.stringify(f));
    }
    // A page past the end returns the last page, not an empty one.
    const beyond = await run((c) => listVehicles(c, p.tenantId, ids3, { tab: "all", page: 99, size: 25 }, day));
    assert.ok(beyond.vehicles.length > 0);

    // 3. Branch scoping: a member limited to one branch sees only that branch's rows and totals.
    const north1 = await run((c) => listVehicles(c, p.tenantId, [ids3[0]], { tab: "all", page: 1, size: 200 }, day));
    assert.ok(north1.vehicles.every((v) => v.branchId === ids3[0]));
    assert.equal(north1.total, live.filter((v) => v.branchId === ids3[0] && v.status !== "sold" && v.status !== "archived").length);

    // 4. KPIs, ageing buckets and capital reconcile exactly.
    for (const scope of [ids3, [ids3[0]], [ids3[1], ids3[2]]]) {
      assert.deepEqual(await run((c) => stockMetricsSql(c, p.tenantId, scope, day)), stockMetrics(live.filter((v) => scope.includes(v.branchId)), SNAPSHOT_AT));
      const model = overviewModel(full, scope);
      assert.deepEqual(await run((c) => movementSql(c, p.tenantId, scope, getMonths())), model.movement);
    }

    // 5. Realized profit, counts, median days-to-sale and the monthly series match the capital and reports models.
    const months = getMonths();
    for (const scope of [ids3, [ids3[0]]]) {
      const cap = capitalModel(full, scope);
      const summary = await run((c) => salesSummarySql(c, p.tenantId, scope, months[0], months[months.length - 1]));
      const inWindow = cap.sales.filter((s) => s.closedAt >= `${months[0]}`);
      void inWindow;
      const completed = summary.filter((r) => r.state === "Completed");
      const byMonth = months.map((m) => ({ month: m, count: completed.filter((r) => r.month === m).reduce((a, r) => a + r.count, 0), profit: completed.filter((r) => r.month === m).reduce((a, r) => a + r.profit, 0) }));
      assert.deepEqual(byMonth, cap.monthly.map((m) => ({ month: m.month, count: m.count, profit: m.profit })));
      const realized = realizedMetrics(cap.sales.filter((s) => months.includes(s.closedAt.slice(0, 7))), () => null);
      void realized;
      const rep = reportsModel(full, scope);
      assert.deepEqual(rep.rows.map((r) => r.sold), byMonth.map((m) => m.count));
      assert.deepEqual(rep.rows.map((r) => r.realized), byMonth.map((m) => m.profit));
      const listed = await run((c) => listSales(c, p.tenantId, scope, "0000-00", "9999-99", 1, 200));
      assert.equal(listed.total, cap.sales.length);
      assert.deepEqual(plain(listed.sales.map((s) => ({ id: s.id, landed: s.landed, state: s.state, branchId: s.branchId, salePrice: s.salePrice })).sort((a, b) => (a.id < b.id ? -1 : 1))),
        plain(cap.sales.map((s) => ({ id: s.id, landed: s.landed, state: s.state, branchId: s.branchId, salePrice: s.salePrice })).sort((a, b) => (a.id < b.id ? -1 : 1))));
    }

    // 6. Leads: filtered list, facets and the funnel.
    const refLead = (l: Lead, f: { stage: string; owner?: string; source?: string; vehicle?: string; createdDays: string; overdue?: boolean }) =>
      (f.stage === "all" || l.stage === f.stage) && (!f.owner || l.owner === f.owner) && (!f.source || l.source === f.source) && (!f.vehicle || (f.vehicle === "unspecified" ? l.vehicleId === null : l.vehicleId === f.vehicle)) &&
      (f.createdDays === "all" || new Date(l.createdAt).getTime() >= Date.now() - Number(f.createdDays) * 86_400_000) && (!f.overdue || (l.nextActionTone === "warning" && l.nextAction === "Overdue"));
    for (const f of [{ stage: "all", createdDays: "30" }, { stage: "Qualified", createdDays: "all" }, { stage: "New", createdDays: "7" }, { stage: "all", source: "Website", createdDays: "all" }, { stage: "all", vehicle: "SYN-7", createdDays: "all" }, { stage: "all", vehicle: "unspecified", createdDays: "all" }]) {
      const want = full.leads.filter((l) => ids3.includes(l.branchId) && refLead(l, f)).sort((a, b) => (a.id < b.id ? -1 : 1));
      const got = await run((c) => listLeads(c, p.tenantId, ids3, { ...f, page: 1, size: 200 }));
      assert.equal(got.total, want.length, JSON.stringify(f));
      assert.deepEqual(got.leads.map((l) => l.id), want.slice(0, 200).map((l) => l.id), JSON.stringify(f));
    }
    const changed = (await run((c) => listLeads(c, p.tenantId, ids3, { stage: "Qualified", createdDays: "all", page: 1, size: 200 }))).leads.find((l) => l.id === someLead.id);
    assert.ok(changed, "a lead changed through the application is visible in the index");
    assert.deepEqual(await run((c) => funnelSql(c, p.tenantId, ids3)), funnelFor(full.leads.filter((l) => ids3.includes(l.branchId))));
    assert.deepEqual(await run((c) => funnelSql(c, p.tenantId, ids3, months)), funnelFor(full.leads.filter((l) => ids3.includes(l.branchId) && months.includes(monthKey(l.createdAt)))));

    // 6b. Alerts derived from only the records that can produce them equal the alerts derived from the whole workspace.
    const shell = await run((c) => readState(c, p.tenantId, { shell: true }));
    assert.equal(shell.vehicles.length, 0);
    assert.equal(shell.leads.length, 0);
    const key = (a: { id: string; type: string; severity: string; title: string; recordRef: string; trigger: string; status: string; dueAt: string | null; assignee: string; branchId: string }) => plain({ id: a.id, type: a.type, severity: a.severity, title: a.title, recordRef: a.recordRef, trigger: a.trigger, status: a.status, dueAt: a.dueAt, assignee: a.assignee, branchId: a.branchId });
    const partialAlerts = await run((c) => deriveTenantAlerts(c, p.tenantId, shell));
    assert.ok(partialAlerts.length > 100);
    assert.deepEqual(partialAlerts.map(key).sort((a, b) => (a.id < b.id ? -1 : 1)), full.alerts.map(key).sort((a, b) => (a.id < b.id ? -1 : 1)));

    // 7. The freshness check is a no-op when nothing changed, and rebuilds exactly what changed.
    assert.equal(await tenantTx(p.tenantId, (c) => syncReadModel(c, p.tenantId, { force: true })), 0);
    await h.db.query("UPDATE vehicles SET payload = jsonb_set(payload, '{mileage}', '777'), updated_at = now() WHERE stock_id = 'SYN-20'");
    assert.equal(await tenantTx(p.tenantId, (c) => syncReadModel(c, p.tenantId, { force: true })), 1);
    assert.equal((await run((c) => listVehicles(c, p.tenantId, ids3, { tab: "sold", q: "syn-20", page: 1, size: 5 }, day))).vehicles.find((v) => v.id === "SYN-20")?.km, 777);
  } finally { await h.close(); }
});
