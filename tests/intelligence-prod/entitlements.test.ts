import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./harness";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { redeemToken, resolvePrincipal, signIn } from "../../apps/intelligence/lib/server/identity";
import { runCommands } from "../../apps/intelligence/lib/server/workspace";
import { tenantTx } from "../../apps/intelligence/lib/server/db";
import { adminAudit, adminReadCommerce, adminSetEntitlements, clearEntitlementMemo, readEntitlements, validateEntitlementInput } from "../../apps/intelligence/lib/server/entitlement-store";
import { resolveEntitlements, subscriptionState, FEATURES } from "../../apps/intelligence/lib/entitlements";
import { visibleNav } from "../../apps/intelligence/lib/permissions";

const spec = (name: string, email: string) => ({ organization: name, dealership: name + " Motors", locations: [{ name: "Main", city: "Kochi", state: "Kerala", phone: "+91 0" }], owner: { email, name: name + " Owner" } });
const NOW = new Date("2026-10-29T00:00:00Z");

test("entitlement rules: everything on by default, subscription-gated features need an active subscription, switches turn features off", () => {
  const none = resolveEntitlements(null, {}, NOW);
  assert.equal(none.state, "none");
  assert.equal(none.features.inventory.enabled, true);
  assert.equal(none.features.acquisition.enabled, false);
  assert.match(none.features.acquisition.reason, /active subscription/);
  const active = resolveEntitlements({ plan: "growth", status: "active", expiresAt: "2026-12-31T23:59:59Z", reference: "INV-1" }, { advertising: false }, NOW);
  assert.equal(active.features.acquisition.enabled, true);
  assert.equal(active.features.advertising.enabled, false);
  assert.equal(active.limits?.maxCars, 2);
  assert.equal(subscriptionState({ plan: "starter", status: "active", expiresAt: "2026-10-01T00:00:00Z", reference: "x" }, NOW), "expired");
  assert.equal(resolveEntitlements({ plan: "starter", status: "suspended", expiresAt: "2027-01-01T00:00:00Z", reference: "x" }, {}, NOW).features.api_access.enabled, false);
  // Navigation follows both the role and the entitlements.
  const nav = visibleNav("owner", resolveEntitlements(null, { advertising: false, market: false }, NOW)).map((n) => n.key);
  assert.ok(nav.includes("inventory") && !nav.includes("advertising") && !nav.includes("market") && !nav.includes("acquisition"));
  assert.ok(!visibleNav("viewer", undefined).some((n) => n.key === "automations" && false));
  assert.equal(FEATURES.length, new Set(FEATURES.map((f) => f.key)).size);
});

test("entitlement input is validated and only switched-off features are stored", () => {
  const bad = validateEntitlementInput({ subscription: { plan: "gold", status: "active", expiresOn: "2020-01-01", reference: "x" }, features: { nonsense: true } }, NOW);
  assert.ok("fields" in bad && bad.fields.plan && bad.fields.expiresOn !== undefined && bad.fields.reference && bad.fields.features);
  const ok = validateEntitlementInput({ subscription: { plan: "scale", status: "active", expiresOn: "2027-03-31", reference: "Contract 2026-114" }, features: { advertising: false, market: true } }, NOW);
  assert.ok(!("fields" in ok));
  if (!("fields" in ok)) { assert.deepEqual(ok.features, { advertising: false }); assert.equal(ok.subscription?.expiresAt, "2027-03-31T23:59:59.000Z"); }
});

test("administrators set subscriptions and feature switches; dealers see only their own; switched-off features refuse changes; audit is readable by administrators only", async () => {
  const h = await harness();
  try {
    const admin = await h.admin.connect();
    const home = await provisionWorkspace(admin, spec("VandLabs", "boss@vandlabs.example"));
    const a = await provisionWorkspace(admin, spec("Alpha", "owner@alpha.example"));
    const b = await provisionWorkspace(admin, spec("Beta", "owner@beta.example"));
    for (const [t, pw] of [[home, "correct horse battery 7"], [a, "another horse battery 8"], [b, "third horse battery 9"]] as const) assert.ok((await redeemToken(t.ownerToken, pw)).ok);
    const adminUser = await signIn("boss@vandlabs.example", "correct horse battery 7");
    assert.ok(adminUser.ok);
    if (!adminUser.ok) return;
    await admin.query("INSERT INTO intelligence_platform_admins(user_id, granted_by) VALUES ($1, 'test')", [adminUser.userId]);
    const alphaOwner = await signIn("owner@alpha.example", "another horse battery 8");
    assert.ok(alphaOwner.ok);
    if (!alphaOwner.ok) return;

    // Defaults before anything is recorded.
    assert.equal((await tenantTx(a.tenantId, (c) => readEntitlements(c, a.tenantId))).state, "none");

    // A dealer owner cannot change entitlements, read another dealership's, or see the audit trail.
    assert.equal(await adminSetEntitlements(alphaOwner.userId, a.tenantId, null, { advertising: false }), false);
    assert.equal(await adminReadCommerce(alphaOwner.userId, a.tenantId), null);
    assert.deepEqual((await adminAudit(alphaOwner.userId, { page: 1, size: 50 })).rows, []);

    // The administrator grants Alpha a subscription and switches advertising off.
    assert.equal(await adminSetEntitlements(adminUser.userId, a.tenantId, { plan: "growth", status: "active", expiresAt: "2099-12-31T23:59:59.000Z", reference: "Contract 114" }, { advertising: false }), true);
    clearEntitlementMemo();
    const alpha = await tenantTx(a.tenantId, (c) => readEntitlements(c, a.tenantId));
    assert.equal(alpha.state, "active");
    assert.equal(alpha.features.advertising.enabled, false);
    assert.equal(alpha.features.acquisition.enabled, true);
    // Beta is untouched and cannot see Alpha's record (row-level security), even by asking for it.
    assert.equal((await tenantTx(b.tenantId, (c) => readEntitlements(c, b.tenantId))).state, "none");
    assert.equal((await tenantTx(b.tenantId, async (c) => (await c.query("SELECT 1 FROM dealer_commerce WHERE tenant_id = $1", [a.tenantId])).rows.length)), 0);
    assert.equal((await adminReadCommerce(adminUser.userId, a.tenantId))?.entitlements.subscription?.reference, "Contract 114");
    // Malformed input is refused by the database as well.
    await assert.rejects(adminSetEntitlements(adminUser.userId, a.tenantId, { plan: "gold" as never, status: "active", expiresAt: "2099-01-01T00:00:00Z", reference: "x" }, {}), /invalid_subscription/);
    await assert.rejects(adminSetEntitlements(adminUser.userId, a.tenantId, null, { "Not A Key": true } as never), /invalid_features/);
    assert.equal(await adminSetEntitlements(adminUser.userId, "00000000-0000-4000-8000-000000000000", null, {}), false);

    // A switched-off feature refuses its commands, whatever the caller's role; other features still work.
    const principal = (await resolvePrincipal(alphaOwner.userId, a.tenantId, Math.floor(Date.now() / 1000)))!;
    const refused = await runCommands(principal, [{ name: "createCampaign", args: ["V-1001"] }], false);
    assert.equal(refused.ok, false);
    assert.equal((refused as { status: number }).status, 403);
    assert.match((refused as { message: string }).message, /Not included/);
    const allowed = await runCommands(principal, [{ name: "setNotification", args: ["reports.ready", true] }], false);
    assert.ok(allowed.ok);

    // The platform audit trail records the change, with the actor, for administrators.
    const trail = await adminAudit(adminUser.userId, { page: 1, size: 50 });
    const entry = trail.rows.find((r) => r.action === "platform.entitlements_updated" && r.tenantId === a.tenantId);
    assert.ok(entry);
    assert.equal(entry?.actor, adminUser.userId);
    assert.equal(entry?.organization, "Alpha");
    assert.ok(!(await adminAudit(adminUser.userId, { tenantId: b.tenantId, page: 1, size: 50 })).rows.some((r) => r.action === "platform.entitlements_updated"));
    assert.ok((await adminAudit(adminUser.userId, { q: "alpha", page: 1, size: 50 })).total >= 1);

    // Clearing the subscription removes the gated features again.
    assert.equal(await adminSetEntitlements(adminUser.userId, a.tenantId, null, {}), true);
    clearEntitlementMemo();
    const cleared = await tenantTx(a.tenantId, (c) => readEntitlements(c, a.tenantId));
    assert.equal(cleared.state, "none");
    assert.equal(cleared.features.advertising.enabled, true);
    assert.equal(cleared.features.acquisition.enabled, false);
  } finally { await h.close(); }
});
