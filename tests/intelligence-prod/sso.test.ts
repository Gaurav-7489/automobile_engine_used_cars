import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./harness";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { issueInvite, redeemToken, resolvePrincipal, signIn } from "../../apps/intelligence/lib/server/identity";
import { beginSso, completeSso, type SsoConfig } from "../../apps/intelligence/lib/server/federated";
import { linkedStaffUser } from "../../packages/data/src/federated-identity";

const config: SsoConfig = { origin: "https://intelligence.test", domain: "https://auth.test", clientId: "client-1" };

/** A Cognito stand-in: one token endpoint and one userInfo endpoint. */
function cognito(profile: Record<string, unknown>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/oauth2/token")) return Response.json({ access_token: "access-token" });
    if (url.endsWith("/oauth2/userInfo")) return Response.json(profile);
    return new Response("nope", { status: 404 });
  }) as typeof fetch;
}

async function start(invite?: string) {
  const flow = (await beginSso(config, "google", "/app/overview", invite))!;
  const url = new URL(flow.url);
  assert.equal(url.searchParams.get("identity_provider"), "Google");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("redirect_uri"), "https://intelligence.test/api/auth/sso/google/callback");
  return { cookie: flow.cookie, params: new URLSearchParams({ code: "abc", state: url.searchParams.get("state")! }) };
}

const spec = { organization: "Sso", dealership: "Sso Motors", locations: [{ name: "Main", city: "Kochi", state: "Kerala", phone: "+91 000" }], owner: { email: "owner@sso.example", name: "Sso Owner" } };

test("Google single sign-in maps verified emails to existing members only, links once, and never creates accounts", async () => {
  const h = await harness();
  try {
    const ws = await provisionWorkspace(await h.admin.connect(), spec);
    const created = await redeemToken(ws.ownerToken, "correct horse battery 7");
    assert.ok(created.ok);
    if (!created.ok) return;
    const countUsers = async () => Number((await h.db.query<{ n: string }>("SELECT count(*)::text AS n FROM intelligence_users")).rows[0].n);

    // State must match the signed cookie.
    const s1 = await start();
    assert.deepEqual(await completeSso(config, "google", new URLSearchParams({ code: "abc", state: "forged" }), s1.cookie, cognito({})), { ok: false, reason: "state" });
    assert.deepEqual(await completeSso(config, "google", s1.params, undefined, cognito({})), { ok: false, reason: "state" });

    // An unverified email is never trusted, even if it matches a member.
    const unverified = await completeSso(config, "google", s1.params, s1.cookie, cognito({ sub: "g-1", email: "owner@sso.example", email_verified: "false" }));
    assert.deepEqual(unverified, { ok: false, reason: "unverified" });

    // An unknown address is refused and no account appears.
    const before = await countUsers();
    const s2 = await start();
    assert.deepEqual(await completeSso(config, "google", s2.params, s2.cookie, cognito({ sub: "g-stranger", email: "stranger@elsewhere.example", email_verified: "true" })), { ok: false, reason: "no_access" });
    assert.equal(await countUsers(), before);

    // The member signs in (case-insensitive email) and lands on the same account as the password login.
    const s3 = await start();
    const ok = await completeSso(config, "google", s3.params, s3.cookie, cognito({ sub: "g-owner", email: "Owner@SSO.example", email_verified: "true" }));
    assert.ok(ok.ok);
    if (!ok.ok) return;
    assert.equal(ok.userId, created.userId);
    assert.equal(ok.tenantId, ws.tenantId);
    const password = await signIn("owner@sso.example", "correct horse battery 7");
    assert.ok(password.ok && password.userId === ok.userId);
    assert.ok(await resolvePrincipal(ok.userId, ok.tenantId, Math.floor(Date.now() / 1000)));

    // Command Center / Platform resolve the same subject to the same canonical staff account.
    assert.equal(await linkedStaffUser(h.app, "g-owner"), created.userId);
    assert.equal(await linkedStaffUser(h.app, "g-stranger"), null);

    // Once linked, the subject keeps working and an unrelated email claim cannot re-link it to someone else.
    const s4 = await start();
    const again = await completeSso(config, "google", s4.params, s4.cookie, cognito({ sub: "g-owner", email: "someone.else@sso.example", email_verified: "true" }));
    assert.ok(again.ok && again.userId === created.userId);

    // Disabling the account stops federated sign-in and the Command Center lookup immediately.
    await h.db.exec(`UPDATE intelligence_users SET disabled = true WHERE id = '${created.userId}'`);
    const s5 = await start();
    assert.deepEqual(await completeSso(config, "google", s5.params, s5.cookie, cognito({ sub: "g-owner", email: "owner@sso.example", email_verified: "true" })), { ok: false, reason: "no_access" });
    assert.equal(await linkedStaffUser(h.app, "g-owner"), null);
  } finally {
    await h.close();
  }
});

test("an invitation can be accepted with Google only by the invited address", async () => {
  const h = await harness();
  try {
    const ws = await provisionWorkspace(await h.admin.connect(), { ...spec, organization: "Inv", dealership: "Inv Motors", owner: { email: "owner@inv.example", name: "Owner" } });
    const owner = await redeemToken(ws.ownerToken, "correct horse battery 7");
    assert.ok(owner.ok);
    if (!owner.ok) return;
    const principal = (await resolvePrincipal(owner.userId, ws.tenantId, Math.floor(Date.now() / 1000)))!;
    const invite = await issueInvite(principal, { email: "new.hire@inv.example", name: "New Hire", role: "sales", locationIds: principal.locationIds, dealershipIds: principal.dealershipIds });
    assert.ok(invite.ok);
    if (!invite.ok) return;

    const wrong = await start(invite.token);
    assert.deepEqual(await completeSso(config, "google", wrong.params, wrong.cookie, cognito({ sub: "g-x", email: "attacker@inv.example", email_verified: "true" })), { ok: false, reason: "invite_mismatch" });

    const right = await start(invite.token);
    const joined = await completeSso(config, "google", right.params, right.cookie, cognito({ sub: "g-hire", email: "new.hire@inv.example", email_verified: "true" }));
    assert.ok(joined.ok);
    if (!joined.ok) return;
    const member = await resolvePrincipal(joined.userId, ws.tenantId, Math.floor(Date.now() / 1000));
    assert.equal(member?.role, "sales");
    // The link is reusable without the invitation, which is now spent.
    const next = await start();
    const second = await completeSso(config, "google", next.params, next.cookie, cognito({ sub: "g-hire", email: "new.hire@inv.example", email_verified: "true" }));
    assert.ok(second.ok && second.userId === joined.userId);
    const replay = await start(invite.token);
    assert.equal((await completeSso(config, "google", replay.params, replay.cookie, cognito({ sub: "g-hire", email: "new.hire@inv.example", email_verified: "true" }))).ok, false);
  } finally {
    await h.close();
  }
});
