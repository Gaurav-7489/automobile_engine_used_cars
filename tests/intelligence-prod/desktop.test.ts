import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { harness } from "./harness";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { redeemToken } from "../../apps/intelligence/lib/server/identity";
import { challengeOf, issueCode, redeemCode } from "../../apps/intelligence/lib/server/desktop";
import { clearEntitlementMemo } from "../../apps/intelligence/lib/server/entitlement-store";
import { verifySession, signPayload } from "../../apps/intelligence/lib/session";
import { sameOrigin } from "../../apps/intelligence/lib/server/csrf";

const spec = { organization: "Desk", dealership: "Desk Motors", locations: [{ name: "Main", city: "Kochi", state: "Kerala", phone: "+91 0" }], owner: { email: "owner@desk.example", name: "Owner" } };

test("desktop sign-in: PKCE code is bound to its verifier, works once, expires, and follows the desktop entitlement and account state", async () => {
  const h = await harness();
  try {
    const admin = await h.admin.connect();
    const t = await provisionWorkspace(admin, spec);
    const user = (await redeemToken(t.ownerToken, "correct horse battery 7")) as { ok: true; userId: string };
    assert.ok(user.ok);
    const verifier = randomBytes(32).toString("base64url");
    const code = (await issueCode(user.userId, t.tenantId, challengeOf(verifier)))!;
    assert.ok(code);
    assert.equal(await issueCode(user.userId, t.tenantId, "short"), null, "malformed challenge is refused");

    // A stolen code is useless without the verifier, and a failed guess does not burn the real attempt.
    assert.equal((await redeemCode(code, randomBytes(32).toString("base64url"))).ok, false);
    const ok = await redeemCode(code, verifier);
    assert.ok(ok.ok);
    if (!ok.ok) return;
    const session = await verifySession(ok.token);
    assert.equal(session?.sub, user.userId); assert.equal(session?.tid, t.tenantId);
    assert.equal(ok.expiresIn, 8 * 60 * 60);
    assert.equal((await redeemCode(code, verifier)).ok, false, "a code works once");

    // Expired and forged codes.
    const expired = (await signPayload({ typ: "desktop-code", sub: user.userId, tid: t.tenantId, ch: challengeOf(verifier), exp: Math.floor(Date.now() / 1000) - 5 }))!;
    assert.equal((await redeemCode(expired, verifier)).ok, false);
    assert.equal((await redeemCode(code.slice(0, -2) + "xx", verifier)).ok, false);
    const wrongType = (await signPayload({ typ: "other", sub: user.userId, tid: t.tenantId, ch: challengeOf(verifier), exp: Math.floor(Date.now() / 1000) + 60 }))!;
    assert.equal((await redeemCode(wrongType, verifier)).ok, false);

    // The desktop entitlement is honoured at sign-in.
    await admin.query("INSERT INTO dealer_commerce(tenant_id, payload) VALUES ($1, $2)", [t.tenantId, { features: { desktop: false } }]);
    clearEntitlementMemo();
    const v2 = randomBytes(32).toString("base64url");
    const blocked = await redeemCode((await issueCode(user.userId, t.tenantId, challengeOf(v2)))!, v2);
    assert.ok(!blocked.ok && blocked.status === 403 && /Not included/.test(blocked.message));

    // A disabled account cannot redeem a code issued before it was disabled.
    await admin.query("UPDATE dealer_commerce SET payload = '{}'::jsonb WHERE tenant_id = $1", [t.tenantId]);
    clearEntitlementMemo();
    const v3 = randomBytes(32).toString("base64url");
    const c3 = (await issueCode(user.userId, t.tenantId, challengeOf(v3)))!;
    await admin.query("UPDATE intelligence_users SET disabled = true WHERE id = $1", [user.userId]);
    assert.equal((await redeemCode(c3, v3)).ok, false);
  } finally { await h.close(); }
});

test("bearer requests without cookies are exempt from the origin check; cookie-bearing requests are not", () => {
  const req = (headers: Record<string, string>) => new Request("https://app.example/api/x", { method: "POST", headers });
  assert.equal(sameOrigin(req({ authorization: "Bearer abcdefghijklmnopqrstuvwxyz" })), true);
  assert.equal(sameOrigin(req({ authorization: "Bearer abcdefghijklmnopqrstuvwxyz", cookie: "vl_session=x", origin: "https://evil.example", host: "app.example" })), false);
  assert.equal(sameOrigin(req({ origin: "https://evil.example", host: "app.example" })), false);
});
