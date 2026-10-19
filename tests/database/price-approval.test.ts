import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { postgresStore, RecordNotFound, ConflictError, InputError } from "../../packages/data/src/index";
import type { SqlPool } from "../../packages/data/src/postgres";
import { AuthorizationError, type AuthenticatedPrincipal, type Vehicle } from "../../packages/contracts/src/index";
import { vehicles } from "../../packages/demo-data/src/index";

const a = "11111111-1111-4111-a111-111111111111", b = "22222222-2222-4222-a222-222222222222";
const dealer = "33333333-3333-4333-a333-333333333333", location = "44444444-4444-4444-a444-444444444444", vehicleId = "66666666-6666-4666-a666-666666666666";
const cap = (...c: AuthenticatedPrincipal["capabilities"]) => c;

async function setup() {
  const db = new PGlite(); await db.waitReady;
  for (const name of (await readdir("infra/database/migrations")).filter(n => /^000[1-6]|^0010/.test(n)).sort()) await db.exec((await readFile(`infra/database/migrations/${name}`, "utf8")).replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", ""));
  await db.query("INSERT INTO organizations(id,tenant_id,name) VALUES($1,$1,'A'),($2,$2,'B')", [a, b]);
  await db.query("INSERT INTO dealerships(id,tenant_id,organization_id,name,brand_name) VALUES($1,$2,$2,'A','A')", [dealer, a]);
  await db.query("INSERT INTO locations(id,tenant_id,dealership_id,name,city,state,phone) VALUES($1,$2,$3,'Location','City','State','123')", [location, a, dealer]);
  const vehicle: Vehicle = { ...vehicles[0], id: vehicleId, tenantId: a, dealershipId: dealer, locationId: location, price: 1000000, version: 0 };
  await db.query("INSERT INTO vehicles(id,tenant_id,dealership_id,location_id,slug,stock_id,payload,publish_status,availability_status) VALUES($1,$2,$3,$4,'car','stock',$5,'published','available')", [vehicleId, a, dealer, location, vehicle]);
  await db.exec(await readFile("infra/database/application-role.sql", "utf8"));
  const pool: SqlPool = { async connect() { return { async query(sql, values) { const r = await db.query<Record<string, unknown>>(sql, values); return { rows: r.rows }; }, release() {} }; } };
  await db.exec("SET ROLE vandlabs_app");
  const base = { tenantId: a, dealershipIds: [dealer], locationIds: [location] };
  const owner: AuthenticatedPrincipal = { ...base, userId: "owner", capabilities: cap("inventory:read", "inventory:write", "analytics:read", "capital:read", "capital:write") };
  const manager: AuthenticatedPrincipal = { ...base, userId: "manager", capabilities: cap("inventory:read", "inventory:write", "analytics:read") };
  const acquisition: AuthenticatedPrincipal = { ...base, userId: "buyer", capabilities: cap("inventory:read", "inventory:write", "analytics:read", "capital:read") };
  return { db, store: postgresStore(pool), owner, manager, acquisition, patch: { price: 1000000, availabilityStatus: "available" as const, publishStatus: "published" as const } };
}
const cost = { acquiredOn: "2026-09-01", purchasePrice: 900000, reconditioningCost: 20000, transferCost: 5000, otherCost: 0, dailyHoldingCost: null, reference: "INV-1" };

test("a guarded price change by a non-owner is refused directly and routed through a persisted request", async () => {
  const { db, store, owner, manager, patch } = await setup();
  try {
    await store.saveStockCost(owner, vehicleId, cost, 0);                           // cost basis 925,000
    await assert.rejects(store.updateVehicle(manager, vehicleId, { ...patch, price: 880000 }, 0), ConflictError);
    assert.equal((await store.snapshot(owner)).vehicles[0].price, 1000000, "refused change left the price alone");
    await store.updateVehicle(manager, vehicleId, { ...patch, price: 960000 }, 0);   // 4% drop, above cost: allowed
    await assert.rejects(store.requestPriceChange(manager, vehicleId, { proposedPrice: 950000, note: "Small tweak" }, 1), InputError, "no approval needed, so no request");
    const request = await store.requestPriceChange(manager, vehicleId, { proposedPrice: 850000, note: "Slow mover, 90 days" }, 1);
    assert.equal(request.status, "pending");
    assert.ok(request.reasons.includes("large_drop"), "manager sees only the generic reason");
    assert.ok(!request.reasons.includes("below_cost"), "manager has no capital access, so no cost hint");
    await assert.rejects(store.requestPriceChange(manager, vehicleId, { proposedPrice: 840000, note: "Again" }, 1), ConflictError, "one pending request per vehicle");
    const ownerView = (await store.snapshot(owner)).priceRequests!;
    assert.equal(ownerView.length, 1); assert.deepEqual(ownerView[0].reasons.sort(), ["below_cost", "large_drop"]);
    assert.deepEqual((await store.snapshot(manager)).priceRequests![0].reasons, ["large_drop"]);
    // The database itself refuses a second pending row.
    await assert.rejects(db.query("INSERT INTO price_change_requests(id,tenant_id,vehicle_id,status,payload) VALUES('99999999-9999-4999-a999-999999999998',$1,$2,'pending','{}')", [a, vehicleId]), /row-level security/, "no tenant context, no write");
    await db.query("SELECT set_config('app.tenant_id',$1,false)", [a]);
    await assert.rejects(db.query("INSERT INTO price_change_requests(id,tenant_id,vehicle_id,status,payload) VALUES('99999999-9999-4999-a999-999999999999',$1,$2,'pending','{}')", [a, vehicleId]), /duplicate key|unique/i);
  } finally { await db.close(); }
});

test("only a capital-write role decides; approval applies the price once, with history and a version bump", async () => {
  const { db, store, owner, manager, acquisition } = await setup();
  try {
    const request = await store.requestPriceChange(manager, vehicleId, { proposedPrice: 800000, note: "Clear stock" }, 0);
    await assert.rejects(store.decidePriceChange(manager, request.id, { decision: "approved" }), AuthorizationError);
    await assert.rejects(store.decidePriceChange(acquisition, request.id, { decision: "approved" }), AuthorizationError);
    await assert.rejects(store.decidePriceChange({ ...owner, userId: "manager" }, request.id, { decision: "approved" }), AuthorizationError, "nobody approves their own request");
    const done = await store.decidePriceChange(owner, request.id, { decision: "approved", note: "OK" });
    assert.equal(done.status, "approved"); assert.equal(done.decidedBy, "owner");
    const after = await store.snapshot(owner);
    assert.equal(after.vehicles[0].price, 800000); assert.equal(after.vehicles[0].version, 1);
    assert.equal(after.inventoryHistory!.at(-1)!.after.price, 800000); assert.equal(after.inventoryHistory!.at(-1)!.actor, "owner");
    await assert.rejects(store.decidePriceChange(owner, request.id, { decision: "approved" }), ConflictError, "a decided request is final");
  } finally { await db.close(); }
});

test("rejection needs a reason and changes nothing; a request on a changed vehicle goes stale instead of applying", async () => {
  const { db, store, owner, manager, patch } = await setup();
  try {
    const first = await store.requestPriceChange(manager, vehicleId, { proposedPrice: 700000, note: "Aggressive" }, 0);
    await assert.rejects(store.decidePriceChange(owner, first.id, { decision: "rejected" }), InputError);
    const rejected = await store.decidePriceChange(owner, first.id, { decision: "rejected", note: "Too deep" });
    assert.equal(rejected.status, "rejected"); assert.equal((await store.snapshot(owner)).vehicles[0].price, 1000000);
    const second = await store.requestPriceChange(manager, vehicleId, { proposedPrice: 700000, note: "Again, shallower case" }, 0);
    await store.updateVehicle(owner, vehicleId, { ...patch, price: 990000 }, 0);                 // the vehicle moves on
    const stale = await store.decidePriceChange(owner, second.id, { decision: "approved" });
    assert.equal(stale.status, "stale"); assert.match(stale.decisionNote!, /changed after/);
    assert.equal((await store.snapshot(owner)).vehicles[0].price, 990000, "a stale approval is not applied");
    await store.requestPriceChange(manager, vehicleId, { proposedPrice: 700000, note: "Fresh request" }, 1);   // the pending slot is free again
  } finally { await db.close(); }
});

test("requests are tenant isolated and the owner may change a guarded price directly", async () => {
  const { db, store, owner, manager, patch } = await setup();
  try {
    const request = await store.requestPriceChange(manager, vehicleId, { proposedPrice: 800000, note: "Clear stock" }, 0);
    const other = { ...owner, tenantId: b, userId: "other-owner" };
    assert.equal((await store.snapshot(other)).priceRequests!.length, 0);
    await assert.rejects(store.decidePriceChange(other, request.id, { decision: "approved" }), RecordNotFound);
    await store.updateVehicle(owner, vehicleId, { ...patch, price: 700000 }, 0);
    assert.equal((await store.snapshot(owner)).vehicles[0].price, 700000);
  } finally { await db.close(); }
});
