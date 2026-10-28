import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./harness";
import { provisionWorkspace } from "../../apps/intelligence/lib/server/provision";
import { redeemToken, resolvePrincipal, signIn } from "../../apps/intelligence/lib/server/identity";
import { hashToken } from "../../apps/intelligence/lib/server/password";
import { createWorkspace, isPlatformAdmin, listMembers, listWorkspaces, reissueOwnerInvite, setSuspended, validateWorkspace } from "../../apps/intelligence/lib/server/platform-admin";

const spec = (name: string, email: string) => ({
  organization: name, dealership: name + " Motors", locations: [{ name: "Main", city: "Kochi", state: "Kerala", phone: "+91 000" }],
  owner: { email, name: name + " Owner" },
});

test("one sign-in: platform administrators manage every dealership through checked functions only", async () => {
  const h = await harness();
  try {
    const home = await provisionWorkspace(await h.admin.connect(), spec("VandLabs", "admin@vandlabs.example"));
    const other = await provisionWorkspace(await h.admin.connect(), spec("Other", "owner@other.example"));
    assert.ok((await redeemToken(home.ownerToken, "correct horse battery 7")).ok);
    assert.ok((await redeemToken(other.ownerToken, "another horse battery 8")).ok);
    const admin = await signIn("admin@vandlabs.example", "correct horse battery 7");
    const dealer = await signIn("owner@other.example", "another horse battery 8");
    assert.ok(admin.ok && dealer.ok);
    if (!admin.ok || !dealer.ok) return;

    // Nobody is an administrator until the grant is written on the owner connection.
    assert.equal(await isPlatformAdmin(admin.userId), false);
    assert.deepEqual(await listWorkspaces(admin.userId), []);
    await (await h.admin.connect()).query("INSERT INTO intelligence_platform_admins(user_id, granted_by) VALUES ($1, 'test')", [admin.userId]);
    assert.equal(await isPlatformAdmin(admin.userId), true);

    // The runtime role cannot read or write the grant table directly.
    await assert.rejects(h.app.connect().then((c) => c.query("SELECT * FROM intelligence_platform_admins")), /permission denied/);
    await assert.rejects(h.app.connect().then((c) => c.query("INSERT INTO intelligence_platform_admins(user_id, granted_by) VALUES ($1, 'x')", [dealer.userId])), /permission denied/);

    // A dealer owner sees nothing and changes nothing through the admin functions.
    assert.deepEqual(await listWorkspaces(dealer.userId), []);
    assert.deepEqual(await listMembers(dealer.userId, home.tenantId), []);
    assert.equal(await setSuspended(dealer.userId, admin.userId, true, "attempt"), false);
    await assert.rejects(createWorkspace(dealer.userId, { organization: "Sneaky", dealership: "Sneaky", locations: [{ name: "M", city: "Pune", state: "MH", phone: "" }], ownerEmail: "x@y.example", ownerName: "X" }), /not_admin|permission/);

    // The administrator sees both dealerships with their owners.
    const listed = await listWorkspaces(admin.userId);
    assert.equal(listed.length, 2);
    assert.equal(listed.find((w) => w.tenantId === other.tenantId)?.owners, "owner@other.example");

    // Create a dealership: one-time owner link, branch hierarchy, audit entry, duplicate names refused.
    assert.ok(validateWorkspace({ organization: "A", locations: [] }).organization);
    assert.ok(validateWorkspace({ organization: "Good Name", dealership: "Good", ownerName: "Ok", ownerEmail: "a@b.example", locations: [{ name: "M", city: "Not set", state: "X", phone: "" }] })["locations.0"]);
    const created = await createWorkspace(admin.userId, { organization: "Sharma Motors Pvt Ltd", dealership: "Sharma Motors", locations: [{ name: "Main", city: "Pune", state: "Maharashtra", phone: "" }, { name: "East", city: "Pune", state: "Maharashtra", phone: "+91 1" }], ownerEmail: "Owner@Sharma.example", ownerName: "R Sharma" });
    assert.ok(created.ok);
    if (!created.ok) return;
    assert.deepEqual(await createWorkspace(admin.userId, { organization: "sharma motors pvt ltd", dealership: "x", locations: [{ name: "M", city: "Pune", state: "MH", phone: "" }], ownerEmail: "a@b.example", ownerName: "A" }), { ok: false, code: "duplicate" });
    const audit = (await h.db.query<{ action: string; actor: string }>("SELECT action, actor FROM platform_audit WHERE tenant_id = $1", [created.tenantId])).rows;
    assert.deepEqual(audit.map((a) => [a.action, a.actor]), [["workspace.provisioned", admin.userId]]);

    // Re-issue: the earlier unused link stops working; once someone joins, no more owner links can be issued.
    const again = await reissueOwnerInvite(admin.userId, created.tenantId, "owner@sharma.example", "R Sharma");
    assert.ok(again);
    assert.equal((await redeemToken(created.token, "pune dealer horse 42")).ok, false);
    const joined = await redeemToken(again!.token, "pune dealer horse 42");
    assert.ok(joined.ok);
    const owner = await signIn("owner@sharma.example", "pune dealer horse 42");
    assert.ok(owner.ok && owner.tenantId === created.tenantId);
    assert.equal((await resolvePrincipal(owner.ok ? owner.userId : "", created.tenantId, Math.floor(Date.now() / 1000)))?.locationIds.length, 2);
    assert.equal(await reissueOwnerInvite(admin.userId, created.tenantId, "takeover@evil.example", "Evil"), null, "cannot add a second owner to a live workspace");
    assert.equal((await h.db.query("SELECT 1 FROM intelligence_tokens WHERE token_hash = $1", [hashToken("nope")])).rows.length, 0);

    // Suspension signs the person out everywhere and blocks sign-in; administrators cannot suspend themselves.
    const before = Math.floor(Date.now() / 1000) - 5;
    assert.equal(await setSuspended(admin.userId, admin.userId, true, "self"), false);
    assert.equal(await setSuspended(admin.userId, dealer.userId, true, "Chargeback dispute"), true);
    assert.equal(await resolvePrincipal(dealer.userId, other.tenantId, before), null);
    assert.deepEqual(await signIn("owner@other.example", "another horse battery 8"), { ok: false, code: "invalid" });
    const members = await listMembers(admin.userId, other.tenantId);
    assert.equal(members[0]?.suspended, true);
    assert.equal(await setSuspended(admin.userId, dealer.userId, false, ""), true);
    assert.equal((await signIn("owner@other.example", "another horse battery 8")).ok, true);
    const actions = (await h.db.query<{ action: string }>("SELECT action FROM platform_audit WHERE tenant_id = $1 AND action LIKE 'platform.%' ORDER BY occurred_at", [other.tenantId])).rows.map((r) => r.action);
    assert.deepEqual(actions, ["platform.user_suspended", "platform.user_restored"]);
  } finally {
    await h.close();
  }
});
