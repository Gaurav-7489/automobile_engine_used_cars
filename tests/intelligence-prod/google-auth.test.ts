import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./harness";
import { googleAuthUrl, newOAuthState, pkceChallenge, readGoogleIdToken, readOAuthCookie, type GoogleIdentity } from "../../apps/intelligence/lib/server/google-oauth";
import { readGoogleCallback, signInWithGoogle, verifyStepUp } from "../../apps/intelligence/lib/server/google-signin";
import { resolvePrincipal } from "../../apps/intelligence/lib/server/identity";
import { assignOwner, createWorkspaceForGoogle, isPlatformAdmin, linkWebsite, listWorkspaces, setSuspended, unlinkWebsite, websiteKeys } from "../../apps/intelligence/lib/server/platform-admin";
import { authenticateApiKey } from "../../apps/intelligence/lib/server/api-keys";
import { loadWorkspace } from "../../apps/intelligence/lib/server/workspace";
import { legacyPasswordLogin } from "../../apps/intelligence/lib/server/legacy-auth";
import { verifySession } from "../../apps/intelligence/lib/session";
import { newSessionCookie } from "../../apps/intelligence/lib/server/auth";

process.env.GOOGLE_CLIENT_ID = "client-123.apps.googleusercontent.com";
const CLIENT = process.env.GOOGLE_CLIENT_ID;
const now = () => Math.floor(Date.now() / 1000);
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const idToken = (claims: Record<string, unknown>) => `${b64({ alg: "RS256", kid: "k" })}.${b64(claims)}.sig`;
const claims = (over: Record<string, unknown> = {}) => ({ iss: "https://accounts.google.com", aud: CLIENT, azp: CLIENT, sub: "1001", email: "owner@gmail.com", email_verified: true, nonce: "n1", iat: now(), exp: now() + 3600, name: "Owner", ...over });
const google = (sub: string, email: string, over: Partial<GoogleIdentity> = {}): GoogleIdentity => ({ sub, email, name: email.split("@")[0], authoritative: /@gmail\.com$/.test(email), ...over });
const branch = [{ name: "Main", city: "Kochi", state: "Kerala", phone: "98470 12345" }];

test("ID token: issuer, audience, authorized party, expiry, issue time, nonce, verified email and subject are all required", () => {
  assert.equal(readGoogleIdToken(idToken(claims()), "n1")?.sub, "1001");
  assert.equal(readGoogleIdToken(idToken(claims()), "n1")?.authoritative, true, "gmail.com is Google-authoritative");
  assert.equal(readGoogleIdToken(idToken(claims({ iss: "https://evil.example" })), "n1"), null);
  assert.equal(readGoogleIdToken(idToken(claims({ aud: "other-client" })), "n1"), null);
  assert.equal(readGoogleIdToken(idToken(claims({ aud: [CLIENT, "other"] })), "n1"), null, "multiple audiences refused");
  assert.equal(readGoogleIdToken(idToken(claims({ azp: "other-client" })), "n1"), null);
  assert.equal(readGoogleIdToken(idToken(claims({ exp: now() - 10 })), "n1"), null);
  assert.equal(readGoogleIdToken(idToken(claims({ iat: now() + 3600 })), "n1"), null);
  assert.equal(readGoogleIdToken(idToken(claims()), "other-nonce"), null);
  assert.equal(readGoogleIdToken(idToken(claims({ email_verified: false })), "n1"), null, "an unverified email is refused");
  assert.equal(readGoogleIdToken(idToken(claims({ email_verified: "true" })), "n1"), null);
  assert.equal(readGoogleIdToken(idToken(claims({ sub: undefined })), "n1"), null);
  assert.equal(readGoogleIdToken("not-a-jwt", "n1"), null);
  assert.equal(readGoogleIdToken(undefined, "n1"), null);
  const workspace = readGoogleIdToken(idToken(claims({ email: "a@dealer.in", hd: "dealer.in" })), "n1");
  assert.equal(workspace?.authoritative, true, "a Workspace domain matching hd is authoritative");
  assert.equal(readGoogleIdToken(idToken(claims({ email: "a@dealer.in" })), "n1")?.authoritative, false, "an outside address on a consumer Google account is not");
});

test("PKCE S256 and state: the verifier stays in the httpOnly cookie, the URL carries only the challenge", async () => {
  const issued = (await newOAuthState({ purpose: "signin", provider: "google" }))!;
  const url = new URL(googleAuthUrl({ redirectUri: "https://app.example/api/auth/sso/google/callback", state: issued.state, nonce: issued.nonce, verifier: issued.verifier, scope: "openid email profile" }));
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), pkceChallenge(issued.verifier));
  assert.ok(!url.toString().includes(issued.verifier));
  assert.deepEqual(readOAuthCookie(issued.cookie), { nonce: issued.nonce, verifier: issued.verifier });

  let sentVerifier: string | undefined;
  const exchange = async (_code: string, _uri: string, verifier?: string) => { sentVerifier = verifier; return { id_token: idToken(claims({ nonce: issued.nonce })) }; };
  const base = { code: "c", redirectUri: "https://app.example/api/auth/sso/google/callback", purpose: "signin" as const, exchange };
  const ok = await readGoogleCallback({ ...base, state: issued.state, cookie: issued.cookie });
  assert.equal(ok?.identity.sub, "1001");
  assert.equal(sentVerifier, issued.verifier, "the code is exchanged with the PKCE verifier");
  assert.equal(await readGoogleCallback({ ...base, state: issued.state, cookie: undefined }), null, "no cookie: started in another browser");
  assert.equal(await readGoogleCallback({ ...base, state: issued.state, cookie: issued.nonce }), null, "no verifier: refused");
  assert.equal(await readGoogleCallback({ ...base, state: issued.state, cookie: `other~${issued.verifier}` }), null, "nonce mismatch");
  assert.equal(await readGoogleCallback({ ...base, state: issued.state + "x", cookie: issued.cookie }), null, "tampered state");
  assert.equal(await readGoogleCallback({ ...base, state: issued.state, cookie: issued.cookie, purpose: "reauth" }), null, "a sign-in state cannot be used for step-up");
  assert.equal(await readGoogleCallback({ ...base, code: null, state: issued.state, cookie: issued.cookie }), null);
});

test("Google step-up explicitly requests authentication time without changing normal sign-in", () => {
  const input = { redirectUri: "https://app.example/api/auth/sso/google/callback", state: "state", scope: "openid email" };
  const normal = new URL(googleAuthUrl(input));
  assert.equal(normal.searchParams.has("claims"), false);
  assert.equal(normal.searchParams.has("max_age"), false);

  const stepUp = new URL(googleAuthUrl({ ...input, maxAge: 300 }));
  assert.equal(stepUp.searchParams.get("max_age"), "300");
  assert.equal(stepUp.searchParams.has("claims"), false, "auth_time is not an essential claim: its absence must not fail the sign-in");
});

test("sessions record Google authentication; the legacy flag is off unless explicitly enabled", async () => {
  const token = (await newSessionCookie("00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "google"))!;
  assert.equal((await verifySession(token))?.amr, "google");
  assert.equal(legacyPasswordLogin({}), false);
  assert.equal(legacyPasswordLogin({ LEGACY_PASSWORD_LOGIN: "disabled" }), false);
  assert.equal(legacyPasswordLogin({ LEGACY_PASSWORD_LOGIN: "enabled" }), true);
});

test("super admin: one-time bootstrap on the owner connection, bound by Google subject, lands on /admin, never by email alone", async () => {
  const h = await harness();
  try {
    const owner = await h.admin.connect();
    // The application role cannot bootstrap an administrator.
    await assert.rejects(h.app.connect().then((c) => c.query("SELECT intelligence_bootstrap_platform_admin('x@gmail.com','X','me')")), /permission denied/);
    // Before any approval, the same Google account gets nothing.
    assert.deepEqual(await signInWithGoogle(google("g-admin", "vandlabsstudio@gmail.com")), { ok: false, code: "no_account" });

    assert.equal((await owner.query("SELECT intelligence_bootstrap_platform_admin('VandLabsStudio@gmail.com', 'VandLabs Studio', 'release') AS o")).rows[0].o, "approved_new");
    assert.equal((await owner.query("SELECT intelligence_bootstrap_platform_admin('vandlabsstudio@gmail.com', 'VandLabs Studio', 'release') AS o")).rows[0].o, "already_pending", "one approval at a time");

    const first = await signInWithGoogle(google("g-admin", "vandlabsstudio@gmail.com"));
    assert.ok(first.ok && first.platformAdmin, JSON.stringify(first));
    assert.ok(await isPlatformAdmin(first.userId));
    assert.ok(await resolvePrincipal(first.userId, first.tenantId, now()), "the administrator has a usable session in the VandLabs workspace");
    assert.equal((await owner.query("SELECT google_sub FROM intelligence_users WHERE id = $1", [first.userId])).rows[0].google_sub, "g-admin");

    // Used once: another Google account with the same address (impossible for gmail, but proves the binding) is refused.
    assert.deepEqual(await signInWithGoogle(google("g-impostor", "vandlabsstudio@gmail.com")), { ok: false, code: "conflict" });
    assert.equal((await owner.query("SELECT intelligence_bootstrap_platform_admin('vandlabsstudio@gmail.com', 'VandLabs Studio', 'release') AS o")).rows[0].o, "already_admin");
    // Signing in again works by subject even if the Google account's email later changes.
    const later = await signInWithGoogle(google("g-admin", "renamed@gmail.com"));
    assert.ok(later.ok && later.userId === first.userId && later.platformAdmin);
  } finally { await h.close(); }
});

test("an existing password administrator is linked only through a bootstrap approval, never by matching email", async () => {
  const h = await harness();
  try {
    const owner = await h.admin.connect();
    const uid = (await owner.query("INSERT INTO intelligence_users(email, display_name, password_hash) VALUES ('ops@gmail.com', 'Ops', 'scrypt$x') RETURNING id")).rows[0].id as string;
    await owner.query("INSERT INTO intelligence_platform_admins(user_id, granted_by) VALUES ($1, 'test')", [uid]);
    assert.deepEqual(await signInWithGoogle(google("g-ops", "ops@gmail.com")), { ok: false, code: "admin_not_approved" });
    assert.equal((await owner.query("SELECT google_sub FROM intelligence_users WHERE id = $1", [uid])).rows[0].google_sub, null);
    assert.equal((await owner.query("SELECT intelligence_bootstrap_platform_admin('ops@gmail.com', 'Ops', 'release') AS o")).rows[0].o, "approved_existing");
    const r = await signInWithGoogle(google("g-ops", "ops@gmail.com"));
    assert.ok(r.ok && r.userId === uid && r.platformAdmin);
  } finally { await h.close(); }
});

test("admin creates a dealership with the owner's Google email; the first verified sign-in activates it once; strangers get nothing", async () => {
  const h = await harness();
  try {
    const owner = await h.admin.connect();
    await owner.query("SELECT intelligence_bootstrap_platform_admin('vandlabsstudio@gmail.com', 'VandLabs', 'release')");
    const admin = await signInWithGoogle(google("g-admin", "vandlabsstudio@gmail.com"));
    assert.ok(admin.ok);

    // Only a platform administrator can create dealerships.
    const notAdmin = "00000000-0000-4000-8000-0000000000ff";
    await assert.rejects(createWorkspaceForGoogle(notAdmin, { organization: "Rogue", dealership: "Rogue", locations: branch, ownerEmail: "r@gmail.com", ownerName: "R" }), /not_admin/);

    const created = await createWorkspaceForGoogle(admin.userId, { organization: "Delta Motors Pvt Ltd", dealership: "Delta Motors", locations: branch, ownerEmail: "Delta.Owner@gmail.com", ownerName: "Dee" });
    assert.ok(created.ok);
    const list = await listWorkspaces(admin.userId);
    assert.equal(list.find((w) => w.tenantId === created.tenantId)?.pendingOwner, "delta.owner@gmail.com");
    assert.deepEqual(await createWorkspaceForGoogle(admin.userId, { organization: "delta motors pvt ltd", dealership: "D", locations: branch, ownerEmail: "x@gmail.com", ownerName: "X" }), { ok: false, code: "duplicate" });

    // An arbitrary Google account cannot register or join.
    assert.deepEqual(await signInWithGoogle(google("g-stranger", "stranger@gmail.com")), { ok: false, code: "no_account" });

    const first = await signInWithGoogle(google("g-delta", "delta.owner@gmail.com", { name: "Dee Owner" }));
    assert.ok(first.ok && !first.platformAdmin, JSON.stringify(first));
    assert.equal(first.tenantId, created.tenantId, "the Google identity opens the right private workspace");
    const p = (await resolvePrincipal(first.userId, first.tenantId, now()))!;
    assert.equal(p.role, "owner");
    assert.equal((await listWorkspaces(admin.userId)).find((w) => w.tenantId === created.tenantId)?.pendingOwner, undefined, "activated");
    assert.equal(await assignOwner(admin.userId, created.tenantId, "someone@gmail.com", "S"), false, "the owner cannot be swapped once signed in");
    const again = await signInWithGoogle(google("g-delta", "delta.owner@gmail.com"));
    assert.ok(again.ok && again.userId === first.userId);
    assert.equal((await owner.query("SELECT count(*)::int AS n FROM intelligence_users WHERE lower(email) = 'delta.owner@gmail.com'")).rows[0].n, 1);
    assert.equal((await owner.query("SELECT password_hash FROM intelligence_users WHERE id = $1", [first.userId])).rows[0].password_hash, "!google-only");
    assert.ok((await owner.query("SELECT 1 FROM platform_audit WHERE tenant_id = $1 AND action = 'identity.google_activated'", [created.tenantId])).rows.length);

    // Reassigning before first sign-in: the old address stops working, the new one works.
    const second = await createWorkspaceForGoogle(admin.userId, { organization: "Echo Cars", dealership: "Echo", locations: branch, ownerEmail: "typo@gmail.com", ownerName: "E" });
    assert.ok(second.ok);
    assert.ok(await assignOwner(admin.userId, second.tenantId, "echo.owner@gmail.com", "Echo Owner"));
    assert.deepEqual(await signInWithGoogle(google("g-typo", "typo@gmail.com")), { ok: false, code: "no_account" });
    const echo = await signInWithGoogle(google("g-echo", "echo.owner@gmail.com"));
    assert.ok(echo.ok && echo.tenantId === second.tenantId);

    // Tenant isolation: neither owner can open the other's workspace or read its records.
    assert.equal(await resolvePrincipal(first.userId, second.tenantId, now()), null);
    assert.equal(await resolvePrincipal(echo.userId, created.tenantId, now()), null);
    const deltaState = await loadWorkspace(p);
    assert.ok(deltaState.branches.every((b) => !JSON.stringify(b).includes("Echo")));

    // Suspension: refused at sign-in and every live session ends at once.
    const issuedAt = now();
    assert.ok(await resolvePrincipal(echo.userId, echo.tenantId, issuedAt));
    assert.ok(await setSuspended(admin.userId, echo.userId, true, "test"));
    assert.equal(await resolvePrincipal(echo.userId, echo.tenantId, issuedAt), null);
    assert.deepEqual(await signInWithGoogle(google("g-echo", "echo.owner@gmail.com")), { ok: false, code: "disabled" });
    assert.ok(await setSuspended(admin.userId, echo.userId, false, "test"));
    assert.ok((await signInWithGoogle(google("g-echo", "echo.owner@gmail.com"))).ok);
  } finally { await h.close(); }
});

test("existing password members move to Google safely; invitations keep working; links need Google authority or an approval", async () => {
  const h = await harness();
  try {
    const owner = await h.admin.connect();
    await owner.query("SELECT intelligence_bootstrap_platform_admin('vandlabsstudio@gmail.com', 'VandLabs', 'release')");
    const admin = await signInWithGoogle(google("g-admin", "vandlabsstudio@gmail.com"));
    assert.ok(admin.ok);
    const ws = await createWorkspaceForGoogle(admin.userId, { organization: "Foxtrot", dealership: "Foxtrot", locations: branch, ownerEmail: "fox@gmail.com", ownerName: "Fox" });
    assert.ok(ws.ok);
    const fox = await signInWithGoogle(google("g-fox", "fox@gmail.com"));
    assert.ok(fox.ok);

    // A legacy staff member with a password account in this workspace.
    const legacy = (await owner.query("INSERT INTO intelligence_users(email, display_name, password_hash) VALUES ('sales@gmail.com', 'Sales', 'scrypt$x'), ('mgr@dealer.in', 'Mgr', 'scrypt$x') RETURNING id")).rows.map((r) => r.id as string);
    const location = (await owner.query("SELECT id FROM locations WHERE tenant_id = $1", [ws.tenantId])).rows[0].id as string;
    for (const [uid, email] of [[legacy[0], "sales@gmail.com"], [legacy[1], "mgr@dealer.in"]]) {
      await owner.query("INSERT INTO staff_members(tenant_id, user_id, payload) VALUES ($1, $2, $3)", [ws.tenantId, uid, { userId: uid, tenantId: ws.tenantId, displayName: email, role: "sales", email, dealershipIds: [], locationIds: [location], enabled: true, version: 1, updatedAt: new Date().toISOString(), updatedBy: "test" }]);
    }
    const sales = await signInWithGoogle(google("g-sales", "sales@gmail.com"));
    assert.ok(sales.ok && sales.userId === legacy[0] && sales.tenantId === ws.tenantId, "gmail address: Google is authoritative, the existing account is linked");
    assert.deepEqual(await signInWithGoogle(google("g-mgr", "mgr@dealer.in", { authoritative: false })), { ok: false, code: "link_not_approved" }, "an outside address on a consumer Google account is not linked by email alone");
    assert.ok((await signInWithGoogle(google("g-mgr", "mgr@dealer.in", { authoritative: true, hd: "dealer.in" }))).ok, "the dealership's Google Workspace domain is authoritative");

    // An owner's staff invitation (issued before Google-only) is honoured for that email, once, with Google.
    await owner.query("INSERT INTO intelligence_tokens(token_hash, kind, tenant_id, email, role, intelligence_role, dealership_ids, location_ids, display_name, created_by, expires_at) VALUES ('h1','invite',$1,'new.staff@gmail.com','sales','sales','[]',$2,'New','owner',now() + interval '1 day')", [ws.tenantId, JSON.stringify([location])]);
    const invited = await signInWithGoogle(google("g-new", "new.staff@gmail.com"));
    assert.ok(invited.ok && invited.tenantId === ws.tenantId);
    assert.equal((await resolvePrincipal(invited.userId, ws.tenantId, now()))?.role, "sales");
    assert.ok((await owner.query("SELECT used_at FROM intelligence_tokens WHERE token_hash = 'h1'")).rows[0].used_at);
    // Expired invitations grant nothing.
    await owner.query("INSERT INTO intelligence_tokens(token_hash, kind, tenant_id, email, role, intelligence_role, dealership_ids, location_ids, display_name, created_by, expires_at) VALUES ('h2','invite',$1,'late@gmail.com','sales','sales','[]','[]','Late','owner',now() - interval '1 second')", [ws.tenantId]);
    assert.deepEqual(await signInWithGoogle(google("g-late", "late@gmail.com")), { ok: false, code: "no_account" });
  } finally { await h.close(); }
});

test("step-up: the confirming Google account must be the one bound to this user, for this session, authenticated just now", async () => {
  const h = await harness();
  try {
    const owner = await h.admin.connect();
    await owner.query("SELECT intelligence_bootstrap_platform_admin('vandlabsstudio@gmail.com', 'VandLabs', 'release')");
    const admin = await signInWithGoogle(google("g-admin", "vandlabsstudio@gmail.com"));
    assert.ok(admin.ok);
    const sid = now() - 100;
    const state = { n: "n", purpose: "reauth" as const, provider: "google" as const, sub: admin.userId, sid, act: "workspace.create", res: "", exp: now() + 60 };
    const fresh = google("g-admin", "vandlabsstudio@gmail.com", { authTime: now() - 10 });
    assert.equal(await verifyStepUp(state, fresh, { userId: admin.userId, sessionIssuedAt: sid }), true);
    assert.equal(await verifyStepUp(state, { ...fresh, sub: "g-other" }, { userId: admin.userId, sessionIssuedAt: sid }), false, "a different Google account");
    assert.equal(await verifyStepUp(state, { ...fresh, authTime: now() - 3600 }, { userId: admin.userId, sessionIssuedAt: sid }), false, "not a fresh authentication");
    // Google reports no auth_time: the forced-login authorization is the freshness basis, so the confirmation is accepted.
    assert.equal(await verifyStepUp(state, { ...fresh, authTime: undefined }, { userId: admin.userId, sessionIssuedAt: sid }), true, "no auth_time is not a failure");
    assert.equal(await verifyStepUp({ ...state, act: undefined }, fresh, { userId: admin.userId, sessionIssuedAt: sid }), false, "a confirmation must name its action");
    assert.equal(await verifyStepUp(state, fresh, { userId: admin.userId, sessionIssuedAt: sid + 1 }), false, "another session");
    assert.equal(await verifyStepUp({ ...state, sub: "00000000-0000-4000-8000-000000000001" }, fresh, { userId: admin.userId, sessionIssuedAt: sid }), false);
  } finally { await h.close(); }
});

test("VandLabs links a dealership website with a server-to-server key; the dealer types no password into the website", async () => {
  const h = await harness();
  try {
    const owner = await h.admin.connect();
    await owner.query("SELECT intelligence_bootstrap_platform_admin('vandlabsstudio@gmail.com', 'VandLabs', 'release')");
    const admin = await signInWithGoogle(google("g-admin", "vandlabsstudio@gmail.com"));
    assert.ok(admin.ok);
    const a = await createWorkspaceForGoogle(admin.userId, { organization: "Golf", dealership: "Golf", locations: branch, ownerEmail: "golf@gmail.com", ownerName: "G" });
    const b = await createWorkspaceForGoogle(admin.userId, { organization: "Hotel", dealership: "Hotel", locations: branch, ownerEmail: "hotel@gmail.com", ownerName: "H" });
    assert.ok(a.ok && b.ok);
    const first = await linkWebsite(admin.userId, a.tenantId, { host: "golf.example", origin: "https://golf.example" });
    const caller = await authenticateApiKey(`Bearer ${first.key}`);
    assert.equal(caller?.tenantId, a.tenantId, "the key reads only this workspace");
    assert.equal(caller?.scope, "website");
    assert.equal(caller?.name, "Website: golf.example");
    // Relinking replaces the old key.
    const second = await linkWebsite(admin.userId, a.tenantId, { host: "golf.example", origin: "https://golf.example" });
    assert.equal(await authenticateApiKey(`Bearer ${first.key}`), null);
    assert.ok(await authenticateApiKey(`Bearer ${second.key}`));
    const keys = await websiteKeys(admin.userId, a.tenantId);
    assert.equal(keys.filter((k) => !k.revokedAt).length, 1);
    assert.ok(!JSON.stringify(keys).includes(second.key.slice(-43)), "the secret is never listed");
    assert.equal((await websiteKeys(admin.userId, b.tenantId)).length, 0);
    // Non-administrators cannot link or list.
    await assert.rejects(linkWebsite("00000000-0000-4000-8000-0000000000ff", a.tenantId, { host: "x.example", origin: null }), /not_admin/);
    assert.equal((await websiteKeys("00000000-0000-4000-8000-0000000000ff", a.tenantId)).length, 0);
    assert.ok(await unlinkWebsite(admin.userId, a.tenantId, second.id));
    assert.equal(await authenticateApiKey(`Bearer ${second.key}`), null, "unlinked at once");
    assert.equal(await unlinkWebsite(admin.userId, b.tenantId, first.id), false, "a key id from another workspace does nothing");
  } finally { await h.close(); }
});

test("access requests: an unknown Google account asks, VandLabs approves, the same Google account then signs in to its new dealership", async () => {
  const { newAccessCookie, readAccessCookie, submitAccessRequest, accessRequestStatus, listAccessRequests, decideAccessRequest, validateAccessRequest } = await import("../../apps/intelligence/lib/server/access-requests");
  const h = await harness();
  try {
    const owner = await h.admin.connect();
    await owner.query("SELECT intelligence_bootstrap_platform_admin('vandlabsstudio@gmail.com', 'VandLabs', 'release')");
    const admin = await signInWithGoogle(google("g-admin", "vandlabsstudio@gmail.com"));
    assert.ok(admin.ok);

    // The pass that binds a request to the verified Google identity: signed, tamper-evident.
    const visitor = google("g-new-dealer", "new.dealer@gmail.com", { name: "Ravi Kumar" });
    assert.deepEqual(await signInWithGoogle(visitor), { ok: false, code: "no_account" }, "asking grants nothing");
    const pass = (await newAccessCookie(visitor))!;
    assert.equal((await readAccessCookie(pass))?.email, "new.dealer@gmail.com");
    assert.equal(await readAccessCookie(pass.slice(0, -2) + "xx"), null);
    assert.equal(await readAccessCookie(undefined), null);

    assert.ok(Object.keys(validateAccessRequest({ name: "R", phone: "1" }).fields).length >= 5);
    const details = validateAccessRequest({ name: "Ravi Kumar", businessName: "Kumar Autos Pvt Ltd", dealershipName: "Kumar Autos", phone: "98470 12345", city: "Pune", state: "Maharashtra", message: "Used SUVs" }).input!;
    assert.equal(await submitAccessRequest(visitor, details), "created");
    assert.equal(await submitAccessRequest(visitor, { ...details, city: "Mumbai" }), "updated", "one open request per Google account");
    assert.equal((await accessRequestStatus("g-new-dealer"))?.status, "pending");
    assert.equal(await submitAccessRequest(google("g-admin", "vandlabsstudio@gmail.com"), details), "has_account");

    // Only administrators can see or decide requests; the application role cannot read the table directly.
    assert.equal((await listAccessRequests("00000000-0000-4000-8000-0000000000ff", "pending")).length, 0);
    await assert.rejects(h.app.connect().then((c) => c.query("SELECT * FROM intelligence_access_requests")), /permission denied/);
    const [req] = await listAccessRequests(admin.userId, "pending");
    assert.equal(req.email, "new.dealer@gmail.com");
    assert.equal(req.city, "Mumbai");
    await assert.rejects(decideAccessRequest("00000000-0000-4000-8000-0000000000ff", req.id, { approve: true }), /not_admin/);

    const approved = await decideAccessRequest(admin.userId, req.id, { approve: true, dealershipName: "Kumar Autos Pune" });
    assert.ok(approved.tenantId);
    await assert.rejects(decideAccessRequest(admin.userId, req.id, { approve: false }), /not_pending/, "decided once");
    assert.equal((await accessRequestStatus("g-new-dealer"))?.status, "approved");
    const signedIn = await signInWithGoogle(visitor);
    assert.ok(signedIn.ok && signedIn.tenantId === approved.tenantId && !signedIn.platformAdmin, JSON.stringify(signedIn));
    assert.equal((await resolvePrincipal(signedIn.userId, signedIn.tenantId, now()))?.role, "owner");
    const names = (await owner.query("SELECT d.name FROM dealerships d WHERE d.tenant_id = $1", [approved.tenantId])).rows.map((r) => r.name);
    assert.deepEqual(names, ["Kumar Autos Pune"]);
    assert.equal((await owner.query("SELECT city FROM locations WHERE tenant_id = $1", [approved.tenantId])).rows[0].city, "Mumbai");

    // Declined: no access; three declines in 30 days stop further requests.
    const other = google("g-spam", "spam@gmail.com");
    for (let i = 0; i < 3; i++) {
      assert.equal(await submitAccessRequest(other, details), "created");
      const [r] = (await listAccessRequests(admin.userId, "pending")).filter((x) => x.email === "spam@gmail.com");
      assert.equal((await decideAccessRequest(admin.userId, r.id, { approve: false, note: "Not a dealer" })).tenantId, null);
    }
    assert.equal(await submitAccessRequest(other, details), "declined_recently");
    assert.deepEqual(await signInWithGoogle(other), { ok: false, code: "no_account" });
  } finally { await h.close(); }
});
