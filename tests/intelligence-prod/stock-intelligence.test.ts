import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./harness";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { redeemToken, resolvePrincipal } from "../../apps/intelligence/lib/server/identity";
import { loadWorkspace } from "../../apps/intelligence/lib/server/workspace";
import { tenantTx } from "../../apps/intelligence/lib/server/db";
import { syncReadModel } from "../../apps/intelligence/lib/server/read-model";
import { todayIst } from "../../apps/intelligence/lib/server/read-queries";
import { stockReport } from "../../apps/intelligence/lib/server/stock-model";
import { seedSynthetic } from "../../scripts/perf/synthetic";
import { landedCost, stockAgeDays } from "../../apps/intelligence/lib/finance";

test("stock intelligence agrees with a straightforward computation over the full workspace, and withholds evidence by role", async () => {
  const h = await harness();
  try {
    const admin = await h.admin.connect();
    const p = await provisionWorkspace(admin, { organization: "Stock", dealership: "Stock Motors", locations: [{ name: "North", city: "Kochi", state: "Kerala", phone: "+91 0" }, { name: "South", city: "Thrissur", state: "Kerala", phone: "+91 1" }, { name: "East", city: "Kozhikode", state: "Kerala", phone: "+91 2" }], owner: { email: "owner@stock.example", name: "Owner" } });
    const created = await redeemToken(p.ownerToken, "correct horse battery 7");
    assert.ok(created.ok);
    const principal = (await resolvePrincipal((created as { userId: string }).userId, p.tenantId, Math.floor(Date.now() / 1000)))!;
    const ids = (await admin.query("SELECT d.id AS dealership_id, array_agg(l.id ORDER BY l.name) AS locs FROM dealerships d JOIN locations l ON l.tenant_id = d.tenant_id AND l.dealership_id = d.id WHERE d.tenant_id = $1 GROUP BY d.id", [p.tenantId])).rows[0] as { dealership_id: string; locs: string[] };
    await seedSynthetic(admin, p.tenantId, ids, { vehicles: 200, leads: 500, sales: 30 });
    const state = await loadWorkspace(principal);
    const asOf = todayIst();
    const report = await tenantTx(p.tenantId, async (c) => { await syncReadModel(c, p.tenantId); return stockReport(c, p.tenantId, p.locationIds, { capital: true, enquiries: true, page: 1, size: 100, today: asOf }); });

    const live = state.vehicles.filter((v) => ["available", "reserved", "preparation"].includes(v.status));
    const limits = report.policy.bandLimits;
    const bandOf = (age: number) => (age <= limits[0] ? 0 : age <= limits[1] ? 1 : age <= limits[2] ? 2 : 3);
    const expectedBands = [0, 1, 2, 3].map((b) => live.filter((v) => bandOf(stockAgeDays(v, new Date(`${asOf}T12:00:00Z`).toISOString())) === b));
    assert.deepEqual(report.bands.map((b) => b.vehicles), expectedBands.map((b) => b.length));
    assert.deepEqual(report.bands.map((b) => b.capitalPaise), expectedBands.map((b) => b.filter((v) => v.costComplete).reduce((s, v) => s + landedCost(v.costs), 0)));
    assert.equal(report.total, live.length);
    const ages = report.rows.map((r) => r.ageDays);
    assert.deepEqual(ages, [...ages].sort((a, b) => b - a), "oldest first");

    const cutoff = Date.now() - 30 * 86_400_000;
    for (const row of report.rows) {
      const leads = state.leads.filter((l) => l.vehicleId === row.stockId);
      assert.equal(row.enquiries, leads.filter((l) => Date.parse(l.createdAt) >= cutoff).length, row.stockId);
      assert.equal(row.openLeads, leads.filter((l) => l.stage !== "Won" && l.stage !== "Lost").length, row.stockId);
    }

    // Role-limited evidence is withheld, never reported as zero.
    const limited = await tenantTx(p.tenantId, (c) => stockReport(c, p.tenantId, p.locationIds, { capital: false, enquiries: false, page: 1, size: 5, today: asOf }));
    assert.ok(limited.bands.every((b) => b.capitalPaise === null));
    assert.ok(limited.rows.every((r) => r.capitalPaise === null && r.enquiries === null && !r.recommendations.some((x) => x.action !== "inspect")));
    // Branch scope narrows the stock.
    const south = await tenantTx(p.tenantId, (c) => stockReport(c, p.tenantId, [ids.locs[1]], { capital: true, enquiries: true, page: 1, size: 5, today: asOf }));
    assert.equal(south.total, live.filter((v) => v.branchId === ids.locs[1]).length);
    // Filters page the result.
    const old = await tenantTx(p.tenantId, (c) => stockReport(c, p.tenantId, p.locationIds, { capital: true, enquiries: true, band: 3, page: 1, size: 5, today: asOf }));
    assert.equal(old.total, expectedBands[3].length);
    assert.ok(old.rows.length <= 5 && old.rows.every((r) => r.band === 3));
  } finally { await h.close(); }
});
