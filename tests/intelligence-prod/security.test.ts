import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./harness";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { beginTotp, confirmTotp, disableTotp, redeemToken, resolvePrincipal, signIn, totpState } from "../../apps/intelligence/lib/server/identity";
import { authenticateApiKey, createApiKey, listApiKeys, revokeApiKey } from "../../apps/intelligence/lib/server/api-keys";
import { totpCodeForTests, verifyTotp } from "../../apps/intelligence/lib/server/totp";
import { vehicleChecks, validateVehicle, emptyVehicleInput, type VehicleInput } from "../../apps/intelligence/lib/actions/inventory";
import { grossAtAsking } from "../../apps/intelligence/lib/finance";
import { formatLakh2 } from "../../apps/intelligence/lib/format";
import { setAsOf } from "../../apps/intelligence/lib/time";

const spec = (name: string, email: string) => ({
  organization: name, dealership: name + " Motors", locations: [{ name: "Main", city: "Kochi", state: "Kerala", phone: "+91 000" }],
  owner: { email, name: name + " Owner" },
});

test("two-factor login and API keys are enforced against the real schema", async () => {
  const h = await harness();
  try {
    const a = await provisionWorkspace(await h.admin.connect(), spec("Alpha", "owner@alpha.example"));
    const b = await provisionWorkspace(await h.admin.connect(), spec("Beta", "owner@beta.example"));
    for (const [w, email] of [[a, "owner@alpha.example"], [b, "owner@beta.example"]] as const) {
      assert.ok((await redeemToken(w.ownerToken, "correct horse battery 7")).ok, email);
    }
    const first = await signIn("owner@alpha.example", "correct horse battery 7");
    assert.ok(first.ok);
    if (!first.ok) return;

    // Enrolment: a pending secret does not change sign-in until confirmed with a valid code.
    const secret = await beginTotp(first.userId);
    assert.ok(secret);
    assert.equal((await signIn("owner@alpha.example", "correct horse battery 7")).ok, true);
    assert.equal(await confirmTotp(first.userId, "000000"), false);
    assert.equal(await confirmTotp(first.userId, totpCodeForTests(secret!)), true);
    assert.equal((await totpState(first.userId)).enabled, true);
    assert.equal(await beginTotp(first.userId), null, "cannot silently replace an active secret");

    // Sign-in now needs the code; a wrong password never reveals that two-factor is on.
    assert.deepEqual(await signIn("owner@alpha.example", "wrong password here 1"), { ok: false, code: "invalid" });
    assert.deepEqual(await signIn("owner@alpha.example", "correct horse battery 7"), { ok: false, code: "mfa_required" });
    assert.deepEqual(await signIn("owner@alpha.example", "correct horse battery 7", "123456"), { ok: false, code: "mfa_invalid" });
    assert.equal((await signIn("owner@alpha.example", "correct horse battery 7", totpCodeForTests(secret!))).ok, true);
    assert.equal(verifyTotp(secret!, totpCodeForTests(secret!, Date.now() - 10 * 60_000)), false, "old codes expire");

    // Switching off needs a current code.
    assert.equal(await disableTotp(first.userId, "000000"), false);
    assert.equal(await disableTotp(first.userId, totpCodeForTests(secret!)), true);
    assert.equal((await signIn("owner@alpha.example", "correct horse battery 7")).ok, true);

    // API keys: shown once, stored hashed, scoped, tenant-isolated, revocable.
    const owner = await resolvePrincipal(first.userId, a.tenantId, Math.floor(Date.now() / 1000));
    assert.ok(owner);
    const { key, view } = await createApiKey(owner!, "Website feed", "inventory:read", 30);
    assert.match(key, /^vl_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}$/);
    const stored = (await h.db.query<{ key_hash: string }>("SELECT key_hash FROM intelligence_api_keys")).rows;
    assert.ok(stored.every((r) => !key.includes(r.key_hash) && r.key_hash.length === 64), "only a hash is stored");
    const caller = await authenticateApiKey(`Bearer ${key}`);
    assert.equal(caller?.tenantId, a.tenantId);
    assert.equal(caller?.scope, "inventory:read");
    assert.deepEqual(caller?.locationIds, a.locationIds);
    assert.equal(await authenticateApiKey(`Bearer ${key.slice(0, -1)}${key.endsWith("A") ? "B" : "A"}`), null, "tampered secret is rejected");
    assert.equal(await authenticateApiKey(key), null, "Bearer scheme required");
    assert.equal((await listApiKeys(b.tenantId)).length, 0, "tenant B cannot see tenant A keys");
    assert.equal(await revokeApiKey(b.tenantId, view.id), false, "tenant B cannot revoke tenant A keys");
    assert.ok((await listApiKeys(a.tenantId))[0].lastUsedAt);
    assert.equal(await revokeApiKey(a.tenantId, view.id), true);
    assert.equal(await authenticateApiKey(`Bearer ${key}`), null, "revoked keys stop working");
  } finally {
    await h.close();
  }
});

test("plausibility checks from the build review warn, block or pass as specified", () => {
  setAsOf("2026-10-24T12:30:00.000Z");
  const base = (patch: Partial<VehicleInput>): VehicleInput => ({
    ...emptyVehicleInput("b1"), make: "BMW", model: "520d", variant: "Luxury", year: "2021", fuel: "Diesel", transmission: "Automatic", km: "42000", owners: "1", registration: "KL 07 AB 1234", acquiredOn: "2026-09-01",
    asking: "3000000", costs: { acquisition: "2400000", transport: "50000", inspection: "0", refurbishment: "50000", fees: "0" }, ...patch,
  });
  assert.deepEqual(vehicleChecks(base({})), { warnings: {}, overrides: {} });
  // The V-1001 case: ₹5.82 Cr against ₹0.58 L landed must need an Owner override.
  assert.ok(vehicleChecks(base({ asking: "58200000", costs: { acquisition: "58000", transport: "", inspection: "", refurbishment: "", fees: "" } })).overrides.asking);
  assert.ok(vehicleChecks(base({ asking: "5500000" })).warnings.asking, "above 2x landed warns");
  assert.ok(vehicleChecks(base({ asking: "2000000" })).warnings.asking, "below landed warns");
  assert.ok(vehicleChecks(base({ status: "available", costs: { acquisition: "", transport: "", inspection: "", refurbishment: "", fees: "" } })).overrides["costs.acquisition"]);
  assert.ok(vehicleChecks(base({ acquiredOn: "2003-05-07", year: "1990" })).warnings.acquiredOn, "more than 5 years ago warns");
  assert.ok(vehicleChecks(base({ acquiredOn: "2020-05-07" })).warnings.acquiredOn, "before the model year warns");
  assert.ok(vehicleChecks(base({ year: "2015", km: "100" })).warnings.km, "under 500 km on an old car warns");
  assert.ok(vehicleChecks(base({ km: "900000" })).warnings.km, "implausibly high per year warns");
  assert.ok(vehicleChecks(base({ registration: "ABC-123" })).warnings.registration);
  assert.equal(vehicleChecks(base({ registration: "22 BH 1234 AB" })).warnings.registration, undefined);
  assert.ok(validateVehicle(base({ year: "1979" }), true).year, "model year before 1980 is blocked");
  assert.ok(validateVehicle(base({ year: "2028" }), true).year, "model year after next year is blocked");
  assert.equal(validateVehicle(base({ year: "2027" }), true).year, undefined);
  assert.ok(validateVehicle(base({ acquiredOn: "2026-12-01" }), true).acquiredOn, "future acquisition is blocked");
  // Round-number gross test from the review: ₹30,00,000 asking and ₹25,00,000 landed is ₹5.0 L.
  assert.equal(grossAtAsking(3_000_000_00, 2_500_000_00), 500_000_00);
  assert.match(formatLakh2(grossAtAsking(3_000_000_00, 2_500_000_00)), /^₹5\.00? L$/);
});
