import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { commerceService, postgresCommerceRepository, type CommerceRepository } from "../../packages/data/src/commerce";
import type { CommerceState, AuthenticatedPrincipal } from "../../packages/contracts/src/index";
import type { SqlPool } from "../../packages/data/src/postgres";
const tenant = "11111111-1111-4111-a111-111111111111", otherTenant = "22222222-2222-4222-a222-222222222222";
const now = new Date("2026-10-13T12:00:00Z"), expiry = "2026-12-01T00:00:00Z";
const owner: AuthenticatedPrincipal = { userId: "owner", tenantId: tenant, dealershipIds: [], locationIds: [], capabilities: ["inventory:read", "capital:read", "commerce:manage"] };
const admin: AuthenticatedPrincipal = { ...owner, userId: "admin", capabilities: ["platform:admin"], platformTenantIds: [tenant, otherTenant] };
const subscription = { plan: "growth", status: "active", expiresAt: expiry, reference: "Contract 123" };
const source = { id: "licensed", name: "Authorized feed", kind: "licensed_api", agreement: "Dealer use + redistribution agreement", dealerUse: true, redistribute: true, enabled: true, expiresAt: expiry };
const vehicle = { sourceRecordId: "one", make: "Maruti", model: "Swift", year: 2021, city: "Kochi", state: "Kerala", latitude: 9.9312, longitude: 76.2673, fuel: "petrol", transmission: "manual", odometerKm: 40000, purchasePrice: 400000, preparationCost: 20000, transferFees: 5000, resaleLow: 465000, resaleHigh: 485000, demandScore: 80, mileageKmpl: 20, evidence: "verified supplier quote", observedAt: now.toISOString(), expiresAt: expiry, available: true };
const request = { budget: 1000000, reserve: 50000, city: "Kochi", latitude: 9.9312, longitude: 76.2673, radiusKm: 600, count: 2, goal: "margin", fuel: "any", transportPerKm: 20, dailyHoldingCost: 100, holdingDays: 30, annualKm: 12000 };
function memoryRepository() {
  const states = new Map<string, CommerceState>();
  const repository: CommerceRepository = { async transact(id, action) {
    const state = structuredClone(states.get(id) ?? { subscription: null, sources: [], vehicles: [], fuel: [], keys: [], usage: {}, audit: [] });
    const result = action(state); states.set(id, state); return result;
  } };
  return { repository, states };
}
async function configured(repo: CommerceRepository, clock = () => now) {
  const service = commerceService(repo, clock);
  await service.provision(admin, tenant, subscription);
  await service.approveSource(admin, tenant, source);
  await service.ingest(owner, source.id, { vehicles: [vehicle, { ...vehicle, sourceRecordId: "two", model: "i20", purchasePrice: 450000 }], fuel: [{ city: "Kochi", fuel: "petrol", pricePerLitre: 100, observedAt: now.toISOString(), expiresAt: expiry }] });
  return service;
}
test("dealer acquisition includes location, reserve, holding, sourced fuel and unknown evidence", async () => {
  const { repository } = memoryRepository(), service = await configured(repository);
  const report = await service.dealerRecommendations(owner, request);
  assert.equal(report.options.length, 1); assert.equal(report.options[0].landedCost, 906000); assert.equal(report.options[0].remaining, 44000);
  assert.equal(report.options[0].cars[0].annualFuelEstimate, 60000);
  assert.equal(report.options[0].marginLow, 24000);
  await service.ingest(owner, source.id, { vehicles: [{ ...vehicle, sourceRecordId: "unknown", resaleLow: null, resaleHigh: null, demandScore: null, mileageKmpl: null }] });
  const one = await service.dealerRecommendations(owner, { ...request, count: 1 });
  assert.equal(one.options.at(-1)?.marginLow, null);
  assert.equal(one.options.at(-1)?.cars[0].annualFuelEstimate, null);
  const distant = await service.dealerRecommendations(owner, { ...request, city: "Delhi", latitude: 28.6139, longitude: 77.209, radiusKm: 100 });
  assert.equal(distant.options.length, 0);
});
test("API keys are one-time secrets, tenant isolated, scoped, expiring and revocable", async () => {
  const { repository, states } = memoryRepository(), service = await configured(repository);
  const result = await service.createKey(owner, { name: "Business", scopes: ["vehicles:read"], expiresAt: expiry });
  assert.ok(result.token.startsWith("vand_"));
  assert.ok(!JSON.stringify(states.get(tenant)).includes(result.token));
  assert.ok(!JSON.stringify((await service.summary(owner)).keys).includes("digest"));
  const response = await service.business(result.token, "vehicles:read", {});
  assert.equal((response.data as { total: number }).total, 2);
  await assert.rejects(service.business(result.token, "fuel:read", {}), /scope/);
  await assert.rejects(service.business(result.token.slice(0, -1) + "!", "vehicles:read", {}), /Invalid/);
  await assert.rejects(service.revokeKey({ ...owner, tenantId: otherTenant }, result.key.id), /not found/);
  const expired = commerceService(repository, () => new Date("2027-01-01"));
  await assert.rejects(expired.business(result.token, "vehicles:read", {}), /expired/);
  await service.revokeKey(owner, result.key.id);
  await assert.rejects(service.business(result.token, "vehicles:read", {}), /expired/);
});
test("private, disabled and expired source records never leak to the external API", async () => {
  const { repository } = memoryRepository(), service = await configured(repository);
  const { token } = await service.createKey(owner, { name: "API", scopes: ["vehicles:read", "recommendations:read", "fuel:read"], expiresAt: expiry });
  await service.approveSource(admin, tenant, { ...source, redistribute: false });
  assert.equal((await service.summary(owner)).vehicleCount, 2);
  assert.equal(((await service.business(token, "vehicles:read", {})).data as { total: number }).total, 0);
  assert.equal(((await service.business(token, "recommendations:read", request)).data as { options: unknown[] }).options.length, 0);
  assert.deepEqual((await service.business(token, "fuel:read", {})).data, []);
  await service.approveSource(admin, tenant, { ...source, enabled: false });
  assert.equal((await service.dealerRecommendations(owner, request)).options.length, 0);
  await assert.rejects(service.ingest(owner, source.id, { vehicles: [vehicle] }), /agreement/);
});
test("plan gates and tenant-wide rate/monthly quotas cannot be bypassed with multiple keys", async () => {
  const { repository, states } = memoryRepository(), service = await configured(repository);
  const a = await service.createKey(owner, { name: "A", scopes: ["vehicles:read"], expiresAt: expiry });
  const b = await service.createKey(owner, { name: "B", scopes: ["vehicles:read"], expiresAt: expiry });
  await service.provision(admin, tenant, { ...subscription, plan: "starter" });
  await assert.rejects(service.dealerRecommendations(owner, request), /single-car/);
  for (let i = 0; i < 15; i++) await service.business(i % 2 ? a.token : b.token, "vehicles:read", {});
  await assert.rejects(service.business(a.token, "vehicles:read", {}), /rate/);
  states.get(tenant)!.usage = { "month:2026-10": 100 };
  await assert.rejects(service.business(b.token, "vehicles:read", {}), /quota/);
  await service.provision(admin, tenant, { ...subscription, status: "suspended" });
  await assert.rejects(service.business(a.token, "vehicles:read", {}), /active dealership/);
  await assert.rejects(service.provision(owner, tenant, subscription));
  await assert.rejects(service.approveSource({ ...admin, platformTenantIds: [otherTenant] }, tenant, source), /scope/);
});
test("ingestion is idempotent, atomic, validates evidence and does not permit privilege escalation", async () => {
  const { repository } = memoryRepository(), service = await configured(repository);
  await service.ingest(owner, source.id, { vehicles: [vehicle] });
  assert.equal((await service.summary(owner)).vehicleCount, 2);
  await assert.rejects(service.ingest(owner, source.id, { vehicles: [{ ...vehicle, purchasePrice: 1 }, { ...vehicle, sourceRecordId: "broken", purchasePrice: -10 }] }));
  const report = await service.dealerRecommendations(owner, { ...request, count: 1 });
  assert.equal(report.options[0].cars[0].purchasePrice, 400000);
  await assert.rejects(service.ingest({ ...owner, capabilities: ["inventory:read"] }, source.id, { vehicles: [] }));
  await assert.rejects(service.ingest(owner, source.id, { vehicles: [{ ...vehicle, observedAt: "2030-01-01" }] }));
  await assert.rejects(service.createKey(owner, { name: "x", scopes: ["admin"], expiresAt: expiry }));
});
test("real PostgreSQL commerce migration enforces RLS, rollback and durable key revocation", async () => {
  const db = new PGlite(); await db.waitReady;
  try {
    for (const name of (await readdir("infra/database/migrations")).filter(n => n.endsWith(".sql")).sort()) await db.exec((await readFile(`infra/database/migrations/${name}`, "utf8")).replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", ""));
    await db.query("INSERT INTO organizations(id,tenant_id,name) VALUES($1,$1,'A'),($2,$2,'B')", [tenant, otherTenant]);
    await db.exec(await readFile("infra/database/application-role.sql", "utf8"));
    const pool: SqlPool = { async connect() { return { async query(sql, values) { return { rows: (await db.query<Record<string, unknown>>(sql, values)).rows }; }, release() {} }; } };
    const repo = postgresCommerceRepository(pool);
    await assert.rejects(repo.transact(tenant, () => true), /bypass RLS/);
    await db.exec("SET ROLE vandlabs_app");
    const service = await configured(repo);
    assert.equal((await service.summary(owner)).vehicleCount, 2);
    assert.equal((await service.summary({ ...owner, tenantId: otherTenant })).vehicleCount, 0);
    const key = await service.createKey(owner, { name: "Durable key", scopes: ["vehicles:read"], expiresAt: expiry });
    await assert.rejects(repo.transact(tenant, state => { state.vehicles = []; throw new Error("rollback probe"); }), /rollback/);
    assert.equal((await service.summary(owner)).vehicleCount, 2);
    await service.revokeKey(owner, key.key.id);
    await assert.rejects(commerceService(postgresCommerceRepository(pool), () => now).business(key.token, "vehicles:read", {}), /expired/);
  } finally { await db.close(); }
});
