import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type { AuthenticatedPrincipal, PlatformTenant, StaffMember } from "../../packages/contracts/src/index";
import { buildPlatformOverview, type CommerceSlice } from "../../packages/data/src/platform-overview";
import { commerceService, postgresCommerceRepository } from "../../packages/data/src/commerce";
import type { SqlPool } from "../../packages/data/src/postgres";

const now = new Date("2026-10-19T12:00:00Z");
const staff = (n: number, enabled = true): StaffMember[] => Array.from({ length: n }, (_, i) => ({ tenantId: "t", userId: `u${i}@x.example`, displayName: `U${i}`, role: "viewer", dealershipIds: [], locationIds: [], enabled, version: 1, updatedAt: now.toISOString(), updatedBy: "a" }) as StaffMember);
const tenant = (id: string, name: string, over: Partial<PlatformTenant> = {}): PlatformTenant => ({
  tenantId: id, organizationId: id, organization: name,
  dealerships: [{ id: "d", name: "D", locations: [{ id: "l", name: "L", city: "C" }] }],
  counts: { vehicles: 10, unsoldVehicles: 10, publishedVehicles: 5, leads: 0, openTasks: 0, sales: 0 },
  staff: staff(2), audit: [], ...over });
const slice = (plan: "starter" | "growth" | "scale", extra: Partial<CommerceSlice> & { status?: "active" | "suspended" | "cancelled"; expiresAt?: string } = {}): CommerceSlice => ({
  subscription: { plan, status: extra.status ?? "active", expiresAt: extra.expiresAt ?? "2027-06-01T00:00:00Z", reference: "Contract", updatedAt: now.toISOString() },
  usage: extra.usage ?? {}, sources: extra.sources ?? [], sourceSync: extra.sourceSync });
const ready = { ready: true, checks: [{ key: "database", ready: true }] };

test("plan distribution and meters come only from recorded data", () => {
  const overview = buildPlatformOverview(
    [tenant("a", "Alpha"), tenant("b", "Beta"), tenant("c", "Gamma")],
    new Map([["a", slice("starter")], ["b", slice("growth")], ["c", null]]), ready, now);
  assert.deepEqual(overview.plans, { starter: 1, growth: 1, scale: 0, none: 1 });
  assert.equal(overview.billing.activated, false);
  const alpha = overview.tenants[0];
  assert.deepEqual(alpha.meters.map(m => [m.key, m.used, m.limit]), [["seats", 2, 3], ["locations", 1, 1], ["inventory", 10, 50], ["ai", 0, 50], ["api", 0, 100]]);
  assert.ok(overview.alerts.some(a => a.tenantId === "c" && /no subscription record/.test(a.message)));
  assert.ok(!overview.alerts.some(a => a.tenantId === "b"), "a healthy tenant raises nothing");
});

test("limits, expiry and inactive subscriptions raise severity-ordered alerts", () => {
  const overview = buildPlatformOverview(
    [tenant("a", "Alpha", { staff: staff(4), counts: { vehicles: 60, unsoldVehicles: 60, publishedVehicles: 0, leads: 0, openTasks: 0, sales: 0 } }),
      tenant("b", "Beta"), tenant("c", "Gamma"), tenant("d", "Delta", { staff: staff(3) })],
    new Map([
      ["a", slice("starter", { usage: { "ai:2026-10": 46, "month:2026-10": 12 } })],
      ["b", slice("growth", { status: "suspended" })],
      ["c", slice("growth", { expiresAt: "2026-10-26T00:00:00Z" })],
      ["d", slice("starter")],
    ]), ready, now);
  const text = overview.alerts.map(a => `${a.severity}:${a.message}`);
  assert.ok(text.some(t => /^critical:Alpha is over its staff seats limit \(4 of 3\)/.test(t)));
  assert.ok(text.some(t => /^critical:Alpha is over its unsold vehicles limit \(60 of 50\)/.test(t)));
  assert.ok(text.some(t => /^warning:Alpha has used 92% of ai requests this month \(46 of 50\)/.test(t)));
  assert.ok(text.some(t => /^critical:Beta subscription is suspended/.test(t)));
  assert.ok(text.some(t => /^warning:Gamma subscription expires in 6 days/.test(t)));
  assert.ok(text.some(t => /^warning:Delta has used 100% of staff seats \(3 of 3\)/.test(t)), "exactly at the limit is a warning, not over");
  assert.equal(overview.inactive, 1);
  const severities = overview.alerts.map(a => a.severity);
  assert.deepEqual(severities, [...severities].sort((x, y) => ["critical", "warning", "info"].indexOf(x) - ["critical", "warning", "info"].indexOf(y)));
});

test("failed licensed syncs and incomplete configuration are surfaced; unknown data is never presented as zero", () => {
  const failing = slice("growth", {
    sources: [{ id: "s", name: "Supplier", kind: "licensed_api", agreement: "x", dealerUse: true, redistribute: false, enabled: true, expiresAt: "2027-01-01T00:00:00Z" }],
    sourceSync: [{ sourceId: "s", runId: "r", status: "failed", startedAt: now.toISOString(), completedAt: now.toISOString(), leaseExpiresAt: now.toISOString(), lastSucceededAt: null, consecutiveFailures: 2, nextAttemptAt: null, error: "provider_unavailable", received: null, fuelReceived: null }] });
  const overview = buildPlatformOverview([tenant("a", "Alpha")], new Map([["a", failing]]), { ready: false, checks: [{ key: "database", ready: false }, { key: "session", ready: false }] }, now);
  assert.ok(overview.alerts.some(a => /source "Supplier" last sync failed \(provider_unavailable\)/.test(a.message)));
  assert.ok(overview.alerts.some(a => a.tenantId === null && /database, session/.test(a.message)));
  const unknown = buildPlatformOverview([tenant("a", "Alpha")], null, ready, now);
  assert.equal(unknown.tenants[0].state, "unknown");
  assert.deepEqual(unknown.tenants[0].meters, []);
  assert.deepEqual(unknown.plans, { starter: 0, growth: 0, scale: 0, none: 0 });
  assert.ok(unknown.alerts.some(a => /could not be loaded/.test(a.message)));
});

// ---- repository: reads never write -----------------------------------------------------------
test("platform slices read only the administrator's tenants and never create or version rows", async () => {
  const db = new PGlite(); await db.waitReady;
  const a = "11111111-1111-4111-a111-111111111111", b = "22222222-2222-4222-a222-222222222222", outside = "33333333-3333-4333-a333-333333333333";
  try {
    for (const name of (await readdir("infra/database/migrations")).filter(n => n.endsWith(".sql")).sort()) await db.exec((await readFile(`infra/database/migrations/${name}`, "utf8")).replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", ""));
    await db.query("INSERT INTO organizations(id,tenant_id,name) VALUES($1,$1,'A'),($2,$2,'B'),($3,$3,'Outside')", [a, b, outside]);
    await db.exec(await readFile("infra/database/application-role.sql", "utf8")); await db.exec("SET ROLE vandlabs_app");
    const pool: SqlPool = { async connect() { return { async query(sql, values) { const r = await db.query<Record<string, unknown>>(sql, values); return { rows: r.rows }; }, release() {} }; } };
    const service = commerceService(postgresCommerceRepository(pool), () => now);
    const admin: AuthenticatedPrincipal = { userId: "admin", tenantId: a, dealershipIds: [], locationIds: [], capabilities: ["platform:admin"], platformTenantIds: [a, b] };
    await service.provision(admin, a, { plan: "growth", status: "active", expiresAt: "2027-01-01T00:00:00Z", reference: "C1" });
    const rows = async () => { await db.exec("RESET ROLE"); const r = (await db.query<{ tenant_id: string; version: string }>("SELECT tenant_id, version FROM dealer_commerce ORDER BY tenant_id")).rows; await db.exec("SET ROLE vandlabs_app"); return r; };
    const before = await rows();
    const slices = await service.platformSlices(admin);
    assert.deepEqual([...slices.keys()].sort(), [a, b]);
    assert.equal(slices.get(a)?.subscription?.plan, "growth");
    assert.equal(slices.get(b)?.subscription, null, "an unprovisioned tenant reads as no subscription");
    assert.deepEqual(await rows(), before, "reading must not insert rows or bump versions");
    assert.ok(!slices.has(outside), "tenants outside the explicit scope are never read");
    await assert.rejects(service.platformSlices({ ...admin, capabilities: ["inventory:read"] }));
  } finally { await db.close(); }
});
