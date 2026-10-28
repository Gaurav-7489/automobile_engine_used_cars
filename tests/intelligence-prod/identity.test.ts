import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./harness";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { issueInvite, issueReset, redeemToken, resolvePrincipal, revokeSessions, signIn, tokenInfo } from "../../apps/intelligence/lib/server/identity";
import { tenantTx } from "../../apps/intelligence/lib/server/db";

const spec = (name: string, email: string) => ({
  organization: name, dealership: name + " Motors", locations: [{ name: "Main", city: "Kochi", state: "Kerala", phone: "+91 000" }, { name: "Second", city: "Thrissur", state: "Kerala", phone: "+91 111" }],
  owner: { email, name: name + " Owner" },
});

test("owner onboarding, invitations, sign-in, lockout, revocation and tenant isolation", async () => {
  const h = await harness();
  try {
    const a = await (async () => { const c = await h.admin.connect(); return provisionWorkspace(c, spec("Alpha", "owner@alpha.example")); })();
    const b = await (async () => { const c = await h.admin.connect(); return provisionWorkspace(c, spec("Beta", "owner@beta.example")); })();
    // Provisioning refuses to touch an existing organization.
    await assert.rejects(async () => provisionWorkspace(await h.admin.connect(), spec("alpha", "x@alpha.example")), /already exists/);

    // No account exists until the owner redeems the one-time link; an unknown/odd token never works.
    assert.deepEqual(await signIn("owner@alpha.example", "whatever-password-1"), { ok: false, code: "invalid" });
    assert.equal(await redeemToken("nope", "a-very-long-password-1").then((r) => r.ok), false);
    assert.equal((await tokenInfo(a.ownerToken))?.email, "owner@alpha.example");
    assert.match((await redeemToken(a.ownerToken, "short") as { message: string }).message, /12 characters/);
    const created = await redeemToken(a.ownerToken, "correct horse battery 7");
    assert.ok(created.ok && created.outcome === "account_created");
    // Single use.
    assert.equal((await redeemToken(a.ownerToken, "another long password 9")).ok, false);

    // Sign-in
    const wrong = await signIn("owner@alpha.example", "wrong password here 1");
    assert.deepEqual(wrong, { ok: false, code: "invalid" });
    const ok = await signIn("OWNER@alpha.example", "correct horse battery 7");
    assert.ok(ok.ok && ok.tenantId === a.tenantId);
    if (!ok.ok) return;

    // Per-request principal validation
    const issuedAt = Math.floor(Date.now() / 1000);
    const owner = await resolvePrincipal(ok.userId, a.tenantId, issuedAt);
    assert.equal(owner?.role, "owner");
    assert.deepEqual(owner?.locationIds, a.locationIds);
    // The same user has no access to tenant B.
    assert.equal(await resolvePrincipal(ok.userId, b.tenantId, issuedAt), null);

    // Invitation: scoped to the inviter's own branches, one-time, attaches a real account.
    const bad = await issueInvite(owner!, { email: "sales@alpha.example", name: "Sales One", role: "sales", locationIds: b.locationIds, dealershipIds: [a.dealershipId] });
    assert.equal(bad.ok, false);
    const invite = await issueInvite(owner!, { email: "sales@alpha.example", name: "Sales One", role: "finance", locationIds: [a.locationIds[0]], dealershipIds: [a.dealershipId] });
    assert.ok(invite.ok);
    if (!invite.ok) return;
    assert.equal((await redeemToken(invite.token, "sales@alpha.example")).ok, false); // password may not be the email
    const joined = await redeemToken(invite.token, "finance person long pass 3");
    assert.ok(joined.ok);
    const fin = await signIn("sales@alpha.example", "finance person long pass 3");
    assert.ok(fin.ok);
    if (!fin.ok) return;
    // This account was created after the owner's session. A slow runner may
    // cross a second boundary; model the finance user's own fresh sign-in.
    const financeIssuedAt = Math.floor(Date.now() / 1000);
    const finance = await resolvePrincipal(fin.userId, a.tenantId, financeIssuedAt);
    assert.equal(finance?.role, "finance");
    assert.deepEqual(finance?.locationIds, [a.locationIds[0]]);

    // Row-level security: tenant B's context cannot see tenant A's staff, tokens or documents.
    const seen = await tenantTx(b.tenantId, async (c) => ({
      staff: (await c.query("SELECT count(*)::int AS n FROM staff_members")).rows[0].n,
      tokens: (await c.query("SELECT count(*)::int AS n FROM intelligence_tokens WHERE tenant_id = $1", [a.tenantId])).rows[0].n,
    }));
    assert.deepEqual(seen, { staff: 0, tokens: 0 });
    await assert.rejects(() => tenantTx(b.tenantId, (c) => c.query("INSERT INTO staff_members(tenant_id,user_id,payload) VALUES($1,'x','{}')", [a.tenantId])), /row-level security/);
    // The runtime role cannot read credentials directly.
    await assert.rejects(() => tenantTx(a.tenantId, (c) => c.query("SELECT password_hash FROM intelligence_users")), /permission denied/);

    // Revocation applies to sessions issued before it.
    await revokeSessions(fin.userId);
    assert.equal(await resolvePrincipal(fin.userId, a.tenantId, financeIssuedAt - 5), null);
    assert.ok(await resolvePrincipal(fin.userId, a.tenantId, financeIssuedAt + 5));

    // Disabling a membership removes access at once.
    await tenantTx(a.tenantId, (c) => c.query("UPDATE staff_members SET payload = jsonb_set(payload,'{enabled}','false') WHERE user_id = $1", [fin.userId]));
    assert.equal(await resolvePrincipal(fin.userId, a.tenantId, financeIssuedAt + 5), null);
    assert.deepEqual(await signIn("sales@alpha.example", "finance person long pass 3"), { ok: false, code: "no_access" });

    // Lockout after five consecutive failures, even with the right password afterwards.
    for (let i = 0; i < 5; i += 1) await signIn("owner@alpha.example", "definitely wrong " + i);
    assert.deepEqual(await signIn("owner@alpha.example", "correct horse battery 7"), { ok: false, code: "locked" });

    // Reset: issued by an owner for a member of their own workspace only; revokes sessions and clears the lock.
    assert.equal((await issueReset(owner!, "owner@beta.example")).ok, false);
    const reset = await issueReset(owner!, "owner@alpha.example");
    assert.ok(reset.ok);
    if (!reset.ok) return;
    assert.ok((await redeemToken(reset.token, "a fresh long password 42")).ok);
    assert.ok((await signIn("owner@alpha.example", "a fresh long password 42")).ok);
    assert.equal(await resolvePrincipal(ok.userId, a.tenantId, issuedAt - 5), null);
  } finally { await h.close(); }
});
