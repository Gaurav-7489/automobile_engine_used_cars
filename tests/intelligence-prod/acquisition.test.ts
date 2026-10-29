import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./harness";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { tenantTx } from "../../apps/intelligence/lib/server/db";
import { acquisitionInput, acquisitionOverview, CommerceError, runAcquisition } from "../../apps/intelligence/lib/server/acquisition-store";

const spec = (name: string, email: string) => ({ organization: name, dealership: name + " Motors", locations: [{ name: "Main", city: "Kochi", state: "Kerala", phone: "+91 0" }], owner: { email, name: name + " Owner" } });
const request = { budget: 1_000_000, reserve: 50_000, city: "Kochi", latitude: 9.9312, longitude: 76.2673, radiusKm: 600, count: 1, goal: "margin", fuel: "any", transportPerKm: 20, dailyHoldingCost: 100, holdingDays: 30, annualKm: 12_000 };

test("acquisition research needs an active subscription, counts each run, respects plan limits and never crosses tenants", async () => {
  const h = await harness();
  try {
    const admin = await h.admin.connect();
    const a = await provisionWorkspace(admin, spec("Alpha", "owner@alpha.example"));
    const b = await provisionWorkspace(admin, spec("Beta", "owner@beta.example"));
    const soon = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const source = { id: "feed", name: "Licensed feed", kind: "licensed_api", agreement: "Test", dealerUse: true, aiProcessing: false, redistribute: false, enabled: true, expiresAt: soon };
    const car = (id: string, price: number) => ({ id: `feed:${id}`, sourceId: "feed", sourceRecordId: id, make: "Maruti", model: "Swift", year: 2021, city: "Kochi", state: "Kerala", latitude: 9.9312, longitude: 76.2673, purchasePrice: price, preparationCost: 20_000, transferFees: 5_000, resaleLow: 520_000, resaleHigh: 560_000, demandScore: 80, odometerKm: 40_000, fuel: "petrol", transmission: "manual", mileageKmpl: 18, evidence: "test", observedAt: new Date().toISOString(), expiresAt: soon, available: true });
    await admin.query("INSERT INTO dealer_commerce(tenant_id, payload) VALUES ($1, $2)", [a.tenantId, { subscription: null, sources: [source], vehicles: [car("1", 400_000), car("2", 990_000)], fuel: [], keys: [], usage: {}, audit: [] }]);

    // No subscription: refused, and nothing is counted.
    await assert.rejects(tenantTx(a.tenantId, (c) => runAcquisition(c, a.tenantId, acquisitionInput(request))), (e: unknown) => e instanceof CommerceError && e.status === 402);

    await admin.query("UPDATE dealer_commerce SET payload = jsonb_set(payload, '{subscription}', $2::jsonb) WHERE tenant_id = $1", [a.tenantId, JSON.stringify({ plan: "starter", status: "active", expiresAt: soon, reference: "T", updatedAt: new Date().toISOString() })]);
    const first = await tenantTx(a.tenantId, (c) => runAcquisition(c, a.tenantId, acquisitionInput(request)));
    assert.equal(first.usage.monthlyUsed, 1);
    assert.equal(first.candidates, 1, "only the car that fits the budget after reserve is eligible");
    assert.equal(first.options[0].cars[0].id, "feed:1");
    const second = await tenantTx(a.tenantId, (c) => runAcquisition(c, a.tenantId, acquisitionInput(request)));
    assert.equal(second.usage.monthlyUsed, 2);
    assert.equal((await tenantTx(a.tenantId, (c) => acquisitionOverview(c, a.tenantId))).usage?.monthlyUsed, 2);

    // Plan limits: starter cannot buy two cars, and a refused run is not counted.
    await assert.rejects(tenantTx(a.tenantId, (c) => runAcquisition(c, a.tenantId, acquisitionInput({ ...request, count: 2 }))), (e: unknown) => e instanceof CommerceError && e.status === 403);
    assert.equal((await tenantTx(a.tenantId, (c) => acquisitionOverview(c, a.tenantId))).usage?.monthlyUsed, 2);
    assert.throws(() => acquisitionInput({ ...request, reserve: 2_000_000 }), CommerceError);

    // Another dealership has no sources, no subscription and sees none of this.
    const other = await tenantTx(b.tenantId, (c) => acquisitionOverview(c, b.tenantId));
    assert.deepEqual([other.subscription, other.sources.length, other.usage], [null, 0, null]);
  } finally { await h.close(); }
});
