import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./harness";
import { flowCookieValue, newOAuthState, OAUTH_COOKIE_PREFIX, type GoogleIdentity } from "../../apps/intelligence/lib/server/google-oauth";
import { checkStepUp, readGoogleCallback, signInWithGoogle } from "../../apps/intelligence/lib/server/google-signin";
import { signPayload } from "../../apps/intelligence/lib/session";
import { resolvePrincipal, type Principal } from "../../apps/intelligence/lib/server/identity";
import { plain } from "../../apps/intelligence/lib/server/db";
import { accessRequestStatus, decideAccessRequest, listAccessRequests, newAccessCookie, submitAccessRequest, validateAccessRequest } from "../../apps/intelligence/lib/server/access-requests";
import { createWorkspaceForGoogle, linkWebsite } from "../../apps/intelligence/lib/server/platform-admin";
import { linkOwnWebsite, ownWebsites, unlinkOwnWebsite } from "../../apps/intelligence/lib/server/website-owner";
import { STEP_UP_ACTIONS, isStepUpAction, isStepUpResource, STEP_UP_TTL_SECONDS } from "../../apps/intelligence/lib/step-up-actions";

/**
 * Security tests for Google confirmations and the actions they guard. They run against the real migrations in an in-process PostgreSQL,
 * as the runtime role (no row-level-security bypass). Google is stood in for at the token endpoint only.
 */
process.env.GOOGLE_CLIENT_ID = "client-123.apps.googleusercontent.com";
const CLIENT = process.env.GOOGLE_CLIENT_ID;
const REDIRECT = "https://app.example/api/auth/sso/google/callback";
const now = () => Math.floor(Date.now() / 1000);
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const idToken = (claims: Record<string, unknown>) => `${b64({ alg: "RS256", kid: "k" })}.${b64(claims)}.sig`;
const claimsFor = (nonce: string, over: Record<string, unknown> = {}) => ({ iss: "https://accounts.google.com", aud: CLIENT, azp: CLIENT, sub: "g-admin", email: "vandlabsstudio@gmail.com", email_verified: true, nonce, iat: now(), exp: now() + 3600, name: "Admin", ...over });
const google = (sub: string, email: string, over: Partial<GoogleIdentity> = {}): GoogleIdentity => ({ sub, email, name: email.split("@")[0], authoritative: /@gmail\.com$/.test(email), ...over });
const REQUEST = { name: "Owner", businessName: "", dealershipName: "", phone: "98470 12345", city: "Pune", state: "Maharashtra", message: "" };

/** A browser's cookie jar for one flow, as the callback reads it. */
async function callback(issued: NonNullable<Awaited<ReturnType<typeof newOAuthState>>>, claims: (nonce: string) => Record<string, unknown>) {
  const jar = new Map([[`${OAUTH_COOKIE_PREFIX}${issued.nonce}`, issued.cookie]]);
  return readGoogleCallback({
    state: issued.state, code: "code-123", redirectUri: REDIRECT, purpose: "reauth",
    cookie: await flowCookieValue(issued.state, (name) => jar.get(name)),
    exchange: async () => ({ id_token: idToken(claims(issued.nonce)) }),
  });
}

async function platformAdministrator() {
  const h = await harness();
  const owner = await h.admin.connect();
  await owner.query("SELECT intelligence_bootstrap_platform_admin('vandlabsstudio@gmail.com', 'VandLabs', 'release')");
  const admin = await signInWithGoogle(google("g-admin", "vandlabsstudio@gmail.com"));
  if (!admin.ok) throw new Error("bootstrap admin sign-in failed");
  return { h, owner, admin, adminPrincipal: (await resolvePrincipal(admin.userId, admin.tenantId, now()))!, sid: now() - 100 };
}

/** Creates a dealership the way VandLabs does (request, then approval), and returns its owner as signed in with Google. */
async function newDealership(adminUserId: string, sub: string, email: string, businessName: string): Promise<{ tenantId: string; owner: Principal }> {
  const visitor = google(sub, email, { name: "Owner" });
  assert.ok(await newAccessCookie(visitor));
  const input = validateAccessRequest({ ...REQUEST, businessName, dealershipName: `${businessName} Motors` }).input!;
  assert.equal(await submitAccessRequest(visitor, input), "created");
  const request = (await listAccessRequests(adminUserId, "pending")).find((r) => r.email === email)!;
  const approved = await decideAccessRequest(adminUserId, request.id, { approve: true, dealershipName: `${businessName} Motors` });
  const signed = await signInWithGoogle(visitor);
  assert.ok(signed.ok && signed.tenantId === approved.tenantId);
  return { tenantId: signed.tenantId, owner: (await resolvePrincipal(signed.userId, signed.tenantId, now()))! };
}

const FUTURE = () => new Date(Date.now() + 60_000).toISOString();

test("successful Google sign-in: a bound account reaches its workspace; an unknown account does not", async () => {
  const { h, admin } = await platformAdministrator();
  try {
    assert.equal(admin.ok && admin.tenantId.length > 0, true);
    assert.deepEqual(await signInWithGoogle(google("g-stranger", "stranger@gmail.com")), { ok: false, code: "no_account" });
  } finally { await h.close(); }
});

test("missing auth_time: the confirmation is accepted as a forced-login authorization, bound to its action, and recorded as such", async () => {
  const { h, admin, sid } = await platformAdministrator();
  try {
    const issued = (await newOAuthState({ purpose: "reauth", provider: "google", sub: admin.ok ? admin.userId : "", sid, act: "workspace.create", res: "" }))!;
    const read = await callback(issued, (nonce) => claimsFor(nonce));
    assert.ok(read);
    assert.deepEqual(await checkStepUp(read.state, read.identity, { userId: admin.userId, sessionIssuedAt: sid }), { ok: true, method: "google_authorization", action: "workspace.create", resource: "" });
  } finally { await h.close(); }
});

test("invalid OAuth callbacks are refused: a tampered state, a missing flow cookie, a wrong nonce, a foreign issuer", async () => {
  const { h, admin, sid } = await platformAdministrator();
  try {
    const issued = (await newOAuthState({ purpose: "reauth", provider: "google", sub: admin.ok ? admin.userId : "", sid, act: "workspace.create", res: "" }))!;
    const tampered = issued.state.slice(0, -2) + (issued.state.endsWith("A") ? "B" : "A");
    assert.equal(await readGoogleCallback({ state: tampered, code: "c", redirectUri: REDIRECT, purpose: "reauth", cookie: issued.cookie, exchange: async () => ({ id_token: idToken(claimsFor(issued.nonce)) }) }), null, "tampered state");
    assert.equal(await readGoogleCallback({ state: issued.state, code: "c", redirectUri: REDIRECT, purpose: "reauth", cookie: undefined, exchange: async () => ({ id_token: idToken(claimsFor(issued.nonce)) }) }), null, "no flow cookie");
    assert.equal(await callback(issued, () => claimsFor("another-nonce")), null, "wrong nonce");
    assert.equal(await callback(issued, (nonce) => claimsFor(nonce, { iss: "https://evil.example" })), null, "foreign issuer");
  } finally { await h.close(); }
});

test("an expired or reused confirmation is refused: a stale auth_time, an expired state, and a confirmation presented twice", async () => {
  const { h, owner, admin, sid } = await platformAdministrator();
  try {
    const issued = (await newOAuthState({ purpose: "reauth", provider: "google", sub: admin.ok ? admin.userId : "", sid, act: "workspace.create", res: "" }))!;
    const stale = await callback(issued, (nonce) => claimsFor(nonce, { auth_time: now() - 3600 }));
    assert.ok(stale);
    assert.deepEqual(await checkStepUp(stale.state, stale.identity, { userId: admin.userId, sessionIssuedAt: sid }), { ok: false, reason: "auth_time_stale" });

    const expiredState = await signPayload({ n: "n", purpose: "reauth", provider: "google", sub: admin.ok ? admin.userId : "", sid, act: "workspace.create", res: "", exp: now() - 1 });
    assert.equal(await readGoogleCallback({ state: expiredState, code: "c", redirectUri: REDIRECT, purpose: "reauth", cookie: "n~v", exchange: async () => ({ id_token: idToken(claimsFor("n")) }) }), null);

    // Single use: the first presentation of a confirmation id is accepted, the same one again is not.
    const jti = "jti-" + Math.random().toString(36).slice(2).padEnd(20, "x");
    const consume = async (expires: string) => (await plain((c) => c.query("SELECT intelligence_step_up_consume($1, $2) AS ok", [jti, expires]))).rows[0] as { ok: boolean };
    assert.deepEqual(await consume(FUTURE()), { ok: true });
    assert.deepEqual(await consume(FUTURE()), { ok: false }, "a reused confirmation is refused");
    // An expired confirmation is refused even when it was never used.
    assert.deepEqual(await plain((c) => c.query("SELECT intelligence_step_up_consume($1, $2) AS ok", ["expired-" + jti, new Date(Date.now() - 1000).toISOString()])).then((r) => r.rows[0]), { ok: false });
    // The table is not reachable directly by the runtime role.
    await assert.rejects(plain((c) => c.query("SELECT count(*) FROM intelligence_step_up_used")), /permission denied|row-level/i);
    assert.ok(owner);
  } finally { await h.close(); }
});

test("wrong Google account: a confirmation from another Google account, or from another session, is refused", async () => {
  const { h, admin, sid } = await platformAdministrator();
  try {
    const issued = (await newOAuthState({ purpose: "reauth", provider: "google", sub: admin.ok ? admin.userId : "", sid, act: "workspace.create", res: "" }))!;
    const other = await callback(issued, (nonce) => claimsFor(nonce, { sub: "g-intruder", email: "intruder@gmail.com", auth_time: now() - 5 }));
    assert.ok(other);
    assert.deepEqual(await checkStepUp(other.state, other.identity, { userId: admin.userId, sessionIssuedAt: sid }), { ok: false, reason: "account_mismatch" });
    const own = await callback(issued, (nonce) => claimsFor(nonce, { auth_time: now() - 5 }));
    assert.ok(own);
    assert.deepEqual(await checkStepUp(own.state, own.identity, { userId: admin.userId, sessionIssuedAt: sid + 1 }), { ok: false, reason: "session_mismatch" });
  } finally { await h.close(); }
});

test("unauthorized dealership creation: only a VandLabs administrator can approve, create or link; a dealership owner cannot", async () => {
  const { h, admin } = await platformAdministrator();
  try {
    const dealer = await newDealership(admin.ok ? admin.userId : "", "g-owner-a", "owner.a@gmail.com", "Alpha Autos");
    await assert.rejects(createWorkspaceForGoogle(dealer.owner.userId, { organization: "Rogue Org", dealership: "Rogue", ownerEmail: "x@gmail.com", ownerName: "X", locations: [{ name: "Main", city: "Pune", state: "MH", phone: "" }] } as never), /not_admin/);
    await assert.rejects(decideAccessRequest(dealer.owner.userId, "00000000-0000-4000-8000-000000000009", { approve: true }), /not_admin|not_pending/);
    await assert.rejects(linkWebsite(dealer.owner.userId, dealer.tenantId, { host: "alpha.example", origin: "https://alpha.example" }), /not_admin/);
  } finally { await h.close(); }
});

test("unauthorized and cross-tenant website linking: an owner links only their own site; a viewer links nothing; another workspace's link is untouched", async () => {
  const { h, admin } = await platformAdministrator();
  try {
    const a = await newDealership(admin.ok ? admin.userId : "", "g-owner-a", "owner.a@gmail.com", "Alpha Autos");
    const b = await newDealership(admin.ok ? admin.userId : "", "g-owner-b", "owner.b@gmail.com", "Bravo Motors");

    const linked = await linkOwnWebsite(a.owner, "https://www.alpha-autos.example");
    assert.ok(linked.ok);
    const aLinkId = linked.keyId;
    assert.deepEqual((await ownWebsites(a.owner)).map((w) => w.site), ["www.alpha-autos.example"]);
    assert.deepEqual(await ownWebsites(b.owner), [], "owner B cannot see owner A's website");
    assert.equal(await unlinkOwnWebsite(b.owner, aLinkId), false, "owner B cannot disconnect owner A's website");
    assert.equal((await ownWebsites(a.owner)).length, 1, "owner A's link is untouched");

    const viewer = { ...a.owner, role: "viewer" as const };
    const denied = await linkOwnWebsite(viewer, "https://viewer.example");
    assert.equal(denied.ok, false);
    assert.equal(denied.ok === false && denied.code, "forbidden");
    assert.equal(await unlinkOwnWebsite(viewer, aLinkId), false);
    assert.deepEqual(await ownWebsites(viewer), []);
  } finally { await h.close(); }
});

test("website URLs are validated: only plain http(s) addresses without credentials are accepted", async () => {
  const { h, admin } = await platformAdministrator();
  try {
    const a = await newDealership(admin.ok ? admin.userId : "", "g-owner-a", "owner.a@gmail.com", "Alpha Autos");
    for (const bad of ["javascript:alert(1)", "ftp://alpha.example", "https://user:secret@alpha.example", "not a url", ""]) {
      const r = await linkOwnWebsite(a.owner, bad);
      assert.equal(r.ok, false, `rejected: ${bad}`);
    }
    assert.deepEqual(await ownWebsites(a.owner), [], "nothing was saved for a rejected address");
  } finally { await h.close(); }
});

test("duplicate requests create nothing new: a repeated approval, a repeated workspace, and a repeated website link", async () => {
  const { h, owner, admin } = await platformAdministrator();
  try {
    const visitor = google("g-dup", "dup.owner@gmail.com");
    assert.ok(await newAccessCookie(visitor));
    const input = validateAccessRequest({ ...REQUEST, businessName: "Gamma Cars Pvt Ltd", dealershipName: "Gamma Cars" }).input!;
    assert.equal(await submitAccessRequest(visitor, input), "created");
    const request = (await listAccessRequests(admin.ok ? admin.userId : "", "pending")).find((r) => r.email === "dup.owner@gmail.com")!;
    await decideAccessRequest(admin.ok ? admin.userId : "", request.id, { approve: true, dealershipName: "Gamma Cars" });
    await assert.rejects(decideAccessRequest(admin.ok ? admin.userId : "", request.id, { approve: true, dealershipName: "Gamma Cars" }), /not_pending/);
    assert.equal((await owner.query("SELECT count(*)::int AS n FROM dealerships WHERE name = 'Gamma Cars'")).rows[0].n, 1);

    const again = await createWorkspaceForGoogle(admin.ok ? admin.userId : "", { organization: "Gamma Cars Pvt Ltd", dealership: "Gamma Cars", ownerEmail: "someone@gmail.com", ownerName: "Someone", locations: [{ name: "Main", city: "Pune", state: "MH", phone: "" }] } as never);
    assert.deepEqual(again, { ok: false, code: "duplicate" });

    const d = (await signInWithGoogle(visitor));
    assert.ok(d.ok);
    const owner2 = (await resolvePrincipal(d.userId, d.tenantId, now()))!;
    assert.ok((await linkOwnWebsite(owner2, "https://gamma.example")).ok);
    assert.ok((await linkOwnWebsite(owner2, "https://gamma.example")).ok, "linking the same site again replaces its key");
    assert.equal((await ownWebsites(owner2)).length, 1, "one live link per website");
  } finally { await h.close(); }
});

test("a session that has ended cannot confirm anything: a confirmation from an earlier session is refused", async () => {
  const { h, admin, sid } = await platformAdministrator();
  try {
    const issued = (await newOAuthState({ purpose: "reauth", provider: "google", sub: admin.ok ? admin.userId : "", sid, act: "workspace.create", res: "" }))!;
    const read = await callback(issued, (nonce) => claimsFor(nonce, { auth_time: now() - 5 }));
    assert.ok(read);
    assert.equal((await checkStepUp(read.state, read.identity, { userId: admin.userId, sessionIssuedAt: sid - 9999 })).ok, false);
    assert.equal(await accessRequestStatus("g-none"), null);
  } finally { await h.close(); }
});

test("the confirmation vocabulary is closed: only known actions and well-formed resources are accepted", () => {
  assert.equal(STEP_UP_ACTIONS.includes("workspace.websites"), true);
  assert.equal(isStepUpAction("workspace.websites"), true);
  assert.equal(isStepUpAction("workspace.delete_everything"), false);
  assert.equal(isStepUpResource("8f1c2d3e-0000-4000-8000-000000000001"), true);
  assert.equal(isStepUpResource("../../etc"), false);
  assert.equal(isStepUpResource("x".repeat(81)), false);
  assert.equal(STEP_UP_TTL_SECONDS <= 300, true, "a confirmation lasts at most five minutes");
});
