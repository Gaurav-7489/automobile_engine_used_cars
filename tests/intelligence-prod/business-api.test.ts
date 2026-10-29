import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./harness";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { redeemToken } from "../../apps/intelligence/lib/server/identity";
import { tenantTx } from "../../apps/intelligence/lib/server/db";
import { businessCall, createBusinessKey, listBusinessKeys, revokeBusinessKey, runFuel, runIngest, runRecommendations, runVehicles } from "../../apps/intelligence/lib/server/business-api";
import { adminSetSource, clearEntitlementMemo, validateSourceInput } from "../../apps/intelligence/lib/server/entitlement-store";

const spec = (n: string, e: string) => ({ organization: n, dealership: n + " Motors", locations: [{ name: "Main", city: "Kochi", state: "Kerala", phone: "+91 0" }], owner: { email: e, name: n + " Owner" } });
const soon = () => new Date(Date.now() + 60 * 86_400_000).toISOString();
const car = (id: string, price: number) => ({ sourceRecordId: id, make: "Maruti", model: "Swift", year: 2021, city: "Kochi", state: "Kerala", latitude: 9.9312, longitude: 76.2673, fuel: "petrol", transmission: "manual", odometerKm: 40000, purchasePrice: price, preparationCost: 20000, transferFees: 5000, resaleLow: 520000, resaleHigh: 560000, demandScore: 80, mileageKmpl: 18, evidence: "feed", observedAt: new Date().toISOString(), expiresAt: soon(), available: true });
const req = (token: string, method = "GET") => new Request("https://app.example/api/v1/x", { method, headers: { authorization: `Bearer ${token}`, "x-forwarded-for": "203.0.113.9" } });

test("business API: keys, scopes, plan metering, supplier ingest, revocation, tenant isolation, admin source approval", async () => {
  const h = await harness();
  try {
    const admin = await h.admin.connect();
    const a = await provisionWorkspace(admin, spec("Alpha", "owner@alpha.example"));
    const b = await provisionWorkspace(admin, spec("Beta", "owner@beta.example"));
    for (const [t, pw] of [[a, "another horse battery 8"], [b, "third horse battery 9"]] as const) assert.ok((await redeemToken(t.ownerToken, pw)).ok);

    // Source validation and the administrator-only function.
    const bad = validateSourceInput({ id: "BAD ID", kind: "x", expiresOn: "nope" });
    assert.ok("fields" in bad && bad.fields.id && bad.fields.kind && bad.fields.expiresOn && bad.fields.agreement);
    const good = validateSourceInput({ id: "feed", name: "Licensed feed", kind: "licensed_api", agreement: "Agreement 7", dealerUse: true, aiProcessing: false, redistribute: true, enabled: true, expiresOn: soon().slice(0, 10) });
    assert.ok("source" in good);
    assert.equal(await adminSetSource("00000000-0000-4000-8000-000000000001", a.tenantId, (good as { source: Record<string, unknown> }).source), false, "a non-administrator cannot approve sources");

    // Set up commerce state directly (the administrator functions are covered by entitlements.test.ts).
    const source = { id: "feed", name: "Licensed feed", kind: "licensed_api", agreement: "Agreement 7", dealerUse: true, aiProcessing: false, redistribute: true, enabled: true, expiresAt: soon() };
    await admin.query("INSERT INTO dealer_commerce(tenant_id, payload) VALUES ($1, $2)", [a.tenantId, { subscription: { plan: "growth", status: "active", expiresAt: soon(), reference: "T" }, sources: [source], vehicles: [], fuel: [], keys: [], usage: {}, audit: [] }]);
    clearEntitlementMemo();

    const make = (input: { name: string; scopes: never[] | string[]; sourceId?: string; days: number }) => tenantTx(a.tenantId, (c) => createBusinessKey(c, a.tenantId, "Owner", input as never));
    const reader = await make({ name: "reader", scopes: ["vehicles:read", "fuel:read", "recommendations:read"], days: 30 });
    const supplier = await make({ name: "supplier", scopes: ["sourcing:write"], sourceId: "feed", days: 30 });
    await assert.rejects(make({ name: "x", scopes: ["sourcing:write"], sourceId: "nope", days: 30 }), /approved, active source/);
    for (const n of ["k3", "k4", "k5"]) await make({ name: n, scopes: ["vehicles:read"], days: 30 });
    await assert.rejects(make({ name: "k6", scopes: ["vehicles:read"], days: 30 }), /key limit/i, "the plan's key limit is enforced");

    // Supplier ingest: restricted to its own source; scope enforced.
    const ingest = (token: string, body: Record<string, unknown>) => businessCall(req(token, "POST"), "sourcing:write", body, (s, k, n) => runIngest(s, k, body, n));
    const ok = await ingest(supplier.token, { sourceId: "feed", vehicles: [car("1", 400000), car("2", 990000)] });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).data.received, 2);
    assert.equal((await ingest(supplier.token, { sourceId: "other", vehicles: [] })).status, 403, "restricted to its approved source");
    const noScope = await businessCall(req(reader.token), "sourcing:write", {}, () => ({}));
    assert.equal(noScope.status, 403);

    // Reads and recommendations over the ingested data; metering counts each call.
    const veh = await businessCall(req(reader.token), "vehicles:read", {}, (s, _k, n) => runVehicles(s, {}, n));
    assert.equal(veh.status, 200); const vb = await veh.json(); assert.equal(vb.data.length ?? vb.data.items?.length ?? 2, 2);
    const rec = await businessCall(req(reader.token, "POST"), "recommendations:read", {}, (s, _k, n) => runRecommendations(s, { budget: 1000000, reserve: 50000, city: "Kochi", latitude: 9.9312, longitude: 76.2673, radiusKm: 600, count: 1, goal: "margin", fuel: "any", transportPerKm: 20, dailyHoldingCost: 100, holdingDays: 30, annualKm: 12000 }, n));
    assert.equal(rec.status, 200); assert.equal((await rec.json()).data.options[0].cars[0].sourceRecordId, "1");
    const fuel = await businessCall(req(reader.token), "fuel:read", {}, (s, _k, n) => runFuel(s, {}, n));
    assert.equal(fuel.status, 200);
    const used = (await fuel.json()).usage.monthlyUsed;
    assert.equal(used, 4, "successful calls only: ingest, vehicles, recommendations, fuel");

    // Bad keys never touch data: wrong secret, other tenant's key against this tenant, malformed.
    const forged = reader.token.slice(0, -2) + "xx";
    assert.equal((await businessCall(req(forged), "vehicles:read", {}, () => [])).status, 401);
    assert.equal((await businessCall(new Request("https://app.example/x"), "vehicles:read", {}, () => [])).status, 401);
    const [, beta] = [0, await tenantTx(b.tenantId, (c) => listBusinessKeys(c, b.tenantId))];
    assert.deepEqual(beta.keys, [], "another dealership sees none of these keys");
    assert.equal((await businessCall(req(reader.token.replace(/^vand_[^.]+/, `vand_${Buffer.from(b.tenantId).toString("base64url")}`)), "vehicles:read", {}, () => [])).status, 401);

    // Revocation applies at once; the list never exposes secrets.
    assert.ok(await tenantTx(a.tenantId, (c) => revokeBusinessKey(c, a.tenantId, "Owner", reader.key.id)));
    assert.equal((await businessCall(req(reader.token), "vehicles:read", {}, () => [])).status, 401);
    const listed = await tenantTx(a.tenantId, (c) => listBusinessKeys(c, a.tenantId));
    assert.ok(!JSON.stringify(listed).includes(reader.token) && !JSON.stringify(listed).includes("digest"));

    // The api_access feature switch and an expired subscription both stop the API.
    await admin.query("UPDATE dealer_commerce SET payload = jsonb_set(payload, '{features}', '{\"api_access\": false}') WHERE tenant_id = $1", [a.tenantId]);
    clearEntitlementMemo();
    assert.equal((await ingest(supplier.token, { sourceId: "feed", vehicles: [] })).status, 403);
  } finally { await h.close(); }
});
