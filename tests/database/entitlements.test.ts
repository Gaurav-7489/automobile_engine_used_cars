import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { planEntitlements, type AuthenticatedPrincipal, type CommerceState, type DealerSubscription } from "../../packages/contracts/src/index";
import { CommerceError } from "../../packages/data/src/commerce-rules";
import { commerceService, type CommerceRepository } from "../../packages/data/src/commerce";
import { postgresPlatformStore } from "../../packages/data/src/platform";
import { postgresStore } from "../../packages/data/src/index";
import { assertFeature, assertInventoryRoom, assertPlanFits, assertSeatAvailable, entitlementState, takeAiRequest } from "../../packages/data/src/entitlements";
import type { SqlPool } from "../../packages/data/src/postgres";

const now = new Date("2026-10-19T12:00:00Z"), expiry = "2026-12-01T00:00:00Z";
const sub = (plan: DealerSubscription["plan"], status: DealerSubscription["status"] = "active", expiresAt = expiry): DealerSubscription => ({ plan, status, expiresAt, reference: "Contract", updatedAt: now.toISOString() });
const status = (error: unknown) => error instanceof CommerceError ? error.status : undefined;
const rejectsWith = async (action: Promise<unknown>, code: number) => assert.rejects(action, (error: unknown) => status(error) === code);

test("plan catalogue grows monotonically so an upgrade never removes capability", () => {
  const { starter, growth, scale } = planEntitlements;
  for (const key of ["seats", "locations", "inventory", "aiRequestsPerMonth", "storageMb"] as const) {
    assert.ok(starter[key] < growth[key] && growth[key] < scale[key], key);
  }
  for (const feature of starter.features) assert.ok(growth.features.includes(feature));
  for (const feature of growth.features) assert.ok(scale.features.includes(feature));
});

test("a tenant without a subscription runs on Starter limits; suspended, cancelled and expired subscriptions are inactive", () => {
  assert.deepEqual([entitlementState(null, now).plan, entitlementState(null, now).status], ["starter", "unsubscribed"]);
  assert.equal(entitlementState(sub("growth"), now).status, "active");
  assert.equal(entitlementState(sub("growth", "suspended"), now).status, "inactive");
  assert.equal(entitlementState(sub("growth", "cancelled"), now).status, "inactive");
  assert.equal(entitlementState(sub("growth", "active", "2026-10-01T00:00:00Z"), now).status, "inactive");
  assert.equal(entitlementState({ ...sub("growth"), plan: "platinum" as never }, now).status, "inactive");
});

test("seat, inventory and feature rules return distinct HTTP statuses", () => {
  assert.doesNotThrow(() => assertSeatAvailable(sub("starter"), 2, now));
  assert.throws(() => assertSeatAvailable(sub("starter"), 3, now), (e) => status(e) === 409);
  assert.doesNotThrow(() => assertSeatAvailable(null, 2, now));
  assert.throws(() => assertSeatAvailable(sub("growth", "suspended"), 0, now), (e) => status(e) === 402);
  assert.doesNotThrow(() => assertInventoryRoom(sub("starter"), 40, 10, now));
  assert.throws(() => assertInventoryRoom(sub("starter"), 40, 11, now), (e) => status(e) === 409);
  assert.throws(() => assertInventoryRoom(sub("scale", "cancelled"), 0, 1, now), (e) => status(e) === 402);
  assert.throws(() => assertFeature(sub("starter"), "market_intelligence", now), (e) => status(e) === 403);
  assert.doesNotThrow(() => assertFeature(sub("growth"), "market_intelligence", now));
  assert.throws(() => assertFeature(null, "provider_sync", now), (e) => status(e) === 402);
});

test("a plan change is refused when current usage would exceed the new plan", () => {
  assert.doesNotThrow(() => assertPlanFits("starter", { seats: 3, locations: 1, inventory: 50 }));
  assert.throws(() => assertPlanFits("starter", { seats: 4, locations: 2, inventory: 51 }), (e) => status(e) === 409 && /4 staff seats/.test((e as Error).message) && /2 locations/.test((e as Error).message) && /51 unsold/.test((e as Error).message));
  assert.doesNotThrow(() => assertPlanFits("scale", { seats: 40, locations: 15, inventory: 2000 }));
});

test("AI allowance is monthly, per tenant state, and refuses once exhausted", () => {
  const usage: Record<string, number> = {};
  for (let i = 0; i < planEntitlements.starter.aiRequestsPerMonth; i++) assert.equal(takeAiRequest(usage, sub("starter"), now), true);
  assert.equal(takeAiRequest(usage, sub("starter"), now), false);
  assert.equal(takeAiRequest(usage, sub("starter"), new Date("2026-11-02T00:00:00Z")), true, "a new month restores the allowance");
  assert.equal(takeAiRequest({}, sub("growth", "suspended"), now), false);
});

// ---- service level ---------------------------------------------------------------------------
const tenant = "11111111-1111-4111-a111-111111111111";
const owner: AuthenticatedPrincipal = { userId: "owner", tenantId: tenant, dealershipIds: [], locationIds: [], capabilities: ["inventory:read", "analytics:read", "capital:read", "commerce:manage"] };
const admin: AuthenticatedPrincipal = { ...owner, userId: "admin", capabilities: ["platform:admin"], platformTenantIds: [tenant] };
const source = { id: "licensed", name: "Authorized feed", kind: "licensed_api", agreement: "Dealer use + AI agreement", dealerUse: true, aiProcessing: true, redistribute: false, enabled: true, expiresAt: expiry };
const vehicle = { sourceRecordId: "one", make: "Maruti", model: "Swift", year: 2021, city: "Kochi", state: "Kerala", latitude: 9.9312, longitude: 76.2673, fuel: "petrol", transmission: "manual", odometerKm: 40000, purchasePrice: 400000, preparationCost: 20000, transferFees: 5000, resaleLow: 465000, resaleHigh: 485000, demandScore: 82, mileageKmpl: 20, evidence: "Dealer record", observedAt: now.toISOString(), expiresAt: expiry, available: true };
const request = { budget: 1000000, reserve: 50000, city: "Kochi", latitude: 9.9312, longitude: 76.2673, radiusKm: 600, count: 1, goal: "margin", fuel: "any", transportPerKm: 20, dailyHoldingCost: 100, holdingDays: 30, annualKm: 12000 };
function memory(usage?: Parameters<typeof commerceService>[2]) {
  const states = new Map<string, CommerceState>();
  const repository: CommerceRepository = { async transact(id, action) {
    const state = structuredClone(states.get(id) ?? { subscription: null, sources: [], vehicles: [], fuel: [], keys: [], usage: {}, audit: [] });
    const result = action(state); states.set(id, state); return result;
  } };
  return { states, service: commerceService(repository, () => now, usage) };
}
const withAi = async <T>(run: () => Promise<T>) => {
  const before = { token: process.env.DEALER_AI_SERVICE_TOKEN, url: process.env.DEALER_AI_URL };
  process.env.DEALER_AI_SERVICE_TOKEN = "t".repeat(43); process.env.DEALER_AI_URL = "https://ai.example.com/explain";
  try { return await run(); } finally {
    for (const [key, value] of [["DEALER_AI_SERVICE_TOKEN", before.token], ["DEALER_AI_URL", before.url]] as const) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
};
const binding = (calls: { n: number }) => ({ async fetch() { calls.n++; return Response.json({ text: "Commentary", model: "test-model" }); } });
async function stocked(plan: DealerSubscription["plan"]) {
  const { service, states } = memory();
  await service.provision(admin, tenant, { plan, status: "active", expiresAt: expiry, reference: "Contract 1" });
  await service.approveSource(admin, tenant, source);
  await service.ingest(owner, source.id, { vehicles: [vehicle] });
  return { service, states };
}

test("market intelligence is a Growth/Scale feature; Starter is refused server-side", async () => {
  const starter = await stocked("starter");
  await rejectsWith(starter.service.marketIntelligence(owner, {}), 403);
  const growth = await stocked("growth");
  await assert.doesNotReject(growth.service.marketIntelligence(owner, {}));
});

test("AI commentary is metered per month, never blocks the deterministic report, and survives API-quota pruning", async () => {
  await withAi(async () => {
    const calls = { n: 0 }, { service, states } = await stocked("starter");
    const first = await service.dealerRecommendations(owner, request, binding(calls));
    assert.equal(first.ai?.status, "available");
    const second = await service.dealerRecommendations(owner, request, binding(calls));
    assert.equal(second.ai?.status, "available");
    assert.equal(states.get(tenant)!.usage["ai:2026-10"], 2, "the AI counter must not be pruned by the API meter");
    states.get(tenant)!.usage["ai:2026-10"] = planEntitlements.starter.aiRequestsPerMonth;
    const denied = await service.dealerRecommendations(owner, request, binding(calls));
    assert.equal(denied.ai?.status, "quota_exceeded");
    assert.ok(denied.options.length > 0, "deterministic options are still returned");
    assert.equal(calls.n, 2, "no AI call is made once the allowance is spent");
    assert.equal(states.get(tenant)!.usage["ai:2026-10"], planEntitlements.starter.aiRequestsPerMonth);
  });
});

test("no AI request is charged when AI is not configured or the source forbids AI processing", async () => {
  const { service, states } = await stocked("growth");
  assert.equal((await service.dealerRecommendations(owner, request)).ai?.status, "not_configured");
  assert.equal(states.get(tenant)!.usage["ai:2026-10"], undefined);
  await withAi(async () => {
    await service.approveSource(admin, tenant, { ...source, aiProcessing: false });
    const calls = { n: 0 };
    assert.equal((await service.dealerRecommendations(owner, request, binding(calls))).ai?.status, "restricted");
    assert.equal(calls.n, 0);
    assert.equal(states.get(tenant)!.usage["ai:2026-10"], undefined);
  });
});

test("downgrades are refused while usage exceeds the new plan, and allowed once it fits", async () => {
  let usage = { seats: 6, locations: 1, inventory: 10 };
  const { service } = memory(async () => usage);
  await service.provision(admin, tenant, { plan: "growth", status: "active", expiresAt: expiry, reference: "C1" });
  await rejectsWith(service.provision(admin, tenant, { plan: "starter", status: "active", expiresAt: expiry, reference: "C2" }), 409);
  assert.equal((await service.summary(owner)).subscription?.plan, "growth");
  usage = { seats: 3, locations: 1, inventory: 50 };
  await service.provision(admin, tenant, { plan: "starter", status: "active", expiresAt: expiry, reference: "C2" });
  assert.equal((await service.summary(owner)).subscription?.plan, "starter");
  usage = { seats: 99, locations: 9, inventory: 9999 };
  await service.provision(admin, tenant, { plan: "starter", status: "suspended", expiresAt: expiry, reference: "C3" });
  assert.equal((await service.summary(owner)).subscription?.status, "suspended", "suspending is never blocked by usage");
});

test("summary publishes the entitlement catalogue so clients display, but never decide, limits", async () => {
  const { service } = await stocked("growth");
  assert.deepEqual((await service.summary(owner)).entitlements, planEntitlements);
});

// ---- PostgreSQL: seats and inventory under row-level security ---------------------------------
async function database() {
  const db = new PGlite(); await db.waitReady;
  const other = "22222222-2222-4222-a222-222222222222", dealer = "33333333-3333-4333-a333-333333333333", location = "44444444-4444-4444-a444-444444444444";
  for (const name of (await readdir("infra/database/migrations")).filter(n => n.endsWith(".sql")).sort()) await db.exec((await readFile(`infra/database/migrations/${name}`, "utf8")).replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", ""));
  await db.query("INSERT INTO organizations(id,tenant_id,name) VALUES($1,$1,'Dealer Group'),($2,$2,'Other Group')", [tenant, other]);
  await db.query("INSERT INTO dealerships(id,tenant_id,organization_id,name,brand_name) VALUES($1,$2,$2,'Dealer','Dealer')", [dealer, tenant]);
  await db.query("INSERT INTO locations(id,tenant_id,dealership_id,name,city,state,phone) VALUES($1,$2,$3,'Location','City','State','123')", [location, tenant, dealer]);
  await db.exec(await readFile("infra/database/application-role.sql", "utf8")); await db.exec("SET ROLE vandlabs_app");
  const pool: SqlPool = { async connect() { return { async query(sql, values) { const r = await db.query<Record<string, unknown>>(sql, values); return { rows: r.rows }; }, release() {} }; } };
  const setSubscription = (value: DealerSubscription | null) => db.exec(`RESET ROLE; INSERT INTO dealer_commerce(tenant_id,payload) VALUES('${tenant}', '${JSON.stringify({ subscription: value, sources: [], vehicles: [], fuel: [], keys: [], usage: {}, audit: [] })}') ON CONFLICT (tenant_id) DO UPDATE SET payload=EXCLUDED.payload; SET ROLE vandlabs_app;`);
  return { db, pool, other, dealer, location, setSubscription };
}

test("staff seats are enforced atomically in PostgreSQL and respect plan changes and revocation", async () => {
  const { db, pool, dealer, location, setSubscription } = await database();
  try {
    const store = postgresPlatformStore(pool);
    const platformAdmin: AuthenticatedPrincipal = { userId: "platform-admin", tenantId: tenant, dealershipIds: [], locationIds: [], capabilities: ["platform:admin"], platformTenantIds: [tenant] };
    const grant = (id: string, enabled = true, version = 0) => store.saveStaff(platformAdmin, tenant, { userId: id, displayName: id, role: "viewer", dealershipIds: [dealer], locationIds: [location], enabled }, version);
    await setSubscription(sub("starter"));
    const a = await grant("a@dealer.example"); await grant("b@dealer.example"); await grant("c@dealer.example");
    await rejectsWith(grant("d@dealer.example"), 409);
    // Re-saving an already-enabled member never counts it twice.
    await grant("a@dealer.example", true, a.version);
    // Disabling frees the seat; the next member may take it.
    await grant("a@dealer.example", false, a.version + 1);
    await grant("d@dealer.example");
    await rejectsWith(grant("a@dealer.example", true, a.version + 2), 409);
    // Upgrading the plan opens seats without touching existing grants.
    await setSubscription(sub("growth"));
    await grant("a@dealer.example", true, a.version + 2);
    // A suspended subscription can still disable users, but cannot add seats.
    await setSubscription(sub("growth", "suspended"));
    await rejectsWith(grant("e@dealer.example"), 402);
    await assert.doesNotReject(grant("b@dealer.example", false, 1));
  } finally { await db.close(); }
});

test("inventory capacity counts only this tenant's unsold vehicles and applies to previews", async () => {
  const { db, pool, dealer, location, setSubscription, other } = await database();
  try {
    const store = postgresStore(pool);
    const p: AuthenticatedPrincipal = { userId: "owner", tenantId: tenant, dealershipIds: [dealer], locationIds: [location], capabilities: ["inventory:read", "inventory:write"] };
    const row = (n: number) => ({ stockId: `STK-${n}`, make: "Honda", model: "City", variant: "ZX", year: 2022, price: 1200000, mileage: 25000, fuelType: "petrol", transmission: "automatic", ownership: 1, bodyType: "Sedan", condition: "good", exteriorColor: "White", interiorColor: "Black" });
    const rows = (from: number, count: number) => Array.from({ length: count }, (_, i) => row(from + i));
    await setSubscription(sub("starter"));
    await store.createInventoryBatch(p, dealer, location, rows(0, 49));
    await rejectsWith(store.createInventoryBatch(p, dealer, location, rows(100, 2), { preview: true }), 409);
    await assert.doesNotReject(store.createInventoryBatch(p, dealer, location, rows(200, 1)));
    await rejectsWith(store.createInventoryBatch(p, dealer, location, rows(300, 1)), 409);
    // Sold vehicles free capacity.
    await db.exec("RESET ROLE");
    const first = (await db.query<{ id: string; payload: { price: number; version?: number } }>("SELECT id, payload FROM vehicles WHERE tenant_id=$1 ORDER BY created_at LIMIT 1", [tenant])).rows[0];
    await db.exec("SET ROLE vandlabs_app");
    await store.updateVehicle(p, first.id, { price: first.payload.price, availabilityStatus: "sold", publishStatus: "draft" }, first.payload.version ?? 0);
    await assert.doesNotReject(store.createInventoryBatch(p, dealer, location, rows(400, 1)));
    // Another tenant's stock never counts against this tenant.
    await db.exec(`RESET ROLE; INSERT INTO dealerships(id,tenant_id,organization_id,name,brand_name) VALUES('55555555-5555-4555-a555-555555555555','${other}','${other}','D2','D2'); SET ROLE vandlabs_app;`);
    // Growth plan lifts the limit.
    await setSubscription(sub("growth"));
    await assert.doesNotReject(store.createInventoryBatch(p, dealer, location, rows(500, 20)));
    // Cancelled subscriptions cannot add stock.
    await setSubscription(sub("growth", "cancelled"));
    await rejectsWith(store.createInventoryBatch(p, dealer, location, rows(600, 1)), 402);
  } finally { await db.close(); }
});

test("environments without the commerce migration fall back to Starter limits instead of failing", async () => {
  const { db, pool, dealer, location } = await database();
  try {
    await db.exec("RESET ROLE; DROP TABLE dealer_commerce; SET ROLE vandlabs_app;");
    const store = postgresPlatformStore(pool);
    const platformAdmin: AuthenticatedPrincipal = { userId: "platform-admin", tenantId: tenant, dealershipIds: [], locationIds: [], capabilities: ["platform:admin"], platformTenantIds: [tenant] };
    await assert.doesNotReject(store.saveStaff(platformAdmin, tenant, { userId: "x@dealer.example", displayName: "X", role: "viewer", dealershipIds: [dealer], locationIds: [location], enabled: true }, 0));
  } finally { await db.close(); }
});
