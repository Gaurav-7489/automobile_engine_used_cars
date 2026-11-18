import { test } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./harness";
import { flowCookieName, flowCookieValue, googleAuthUrl, newOAuthState, OAUTH_COOKIE_PREFIX, type GoogleIdentity } from "../../apps/intelligence/lib/server/google-oauth";
import { checkStepUp, readGoogleCallback, signInWithGoogle } from "../../apps/intelligence/lib/server/google-signin";
import { signPayload } from "../../apps/intelligence/lib/session";
import { resolvePrincipal } from "../../apps/intelligence/lib/server/identity";
import { accessRequestStatus, decideAccessRequest, listAccessRequests, newAccessCookie, submitAccessRequest, validateAccessRequest } from "../../apps/intelligence/lib/server/access-requests";

process.env.GOOGLE_CLIENT_ID = "client-123.apps.googleusercontent.com";
const CLIENT = process.env.GOOGLE_CLIENT_ID;
const REDIRECT = "https://app.example/api/auth/sso/google/callback";
const now = () => Math.floor(Date.now() / 1000);
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const idToken = (claims: Record<string, unknown>) => `${b64({ alg: "RS256", kid: "k" })}.${b64(claims)}.sig`;
const claimsFor = (nonce: string, over: Record<string, unknown> = {}) => ({ iss: "https://accounts.google.com", aud: CLIENT, azp: CLIENT, sub: "g-admin", email: "vandlabsstudio@gmail.com", email_verified: true, nonce, iat: now(), exp: now() + 3600, name: "Admin", ...over });
const google = (sub: string, email: string, over: Partial<GoogleIdentity> = {}): GoogleIdentity => ({ sub, email, name: email.split("@")[0], authoritative: /@gmail\.com$/.test(email), ...over });

/** Stands in for the browser's cookie jar: every flow's cookie, keyed by its own name. */
type Jar = Map<string, string>;
const jarWith = (...flows: Awaited<ReturnType<typeof newOAuthState>>[]) => {
  const jar: Jar = new Map();
  for (const f of flows) jar.set(`${OAUTH_COOKIE_PREFIX}${f!.nonce}`, f!.cookie);
  return jar;
};

/** Runs the callback as the route does: the state verifies, its flow's own cookie is read, then the code is exchanged (stubbed). */
async function callback(issued: NonNullable<Awaited<ReturnType<typeof newOAuthState>>>, claims: (nonce: string) => Record<string, unknown>, jar: Jar = jarWith(issued), purpose: "signin" | "reauth" = "reauth") {
  return readGoogleCallback({
    state: issued.state, code: "code-123", redirectUri: REDIRECT, purpose,
    cookie: await flowCookieValue(issued.state, (name) => jar.get(name)),
    exchange: async () => ({ id_token: idToken(claims(issued.nonce)) }),
  });
}

async function administrator() {
  const h = await harness();
  const owner = await h.admin.connect();
  await owner.query("SELECT intelligence_bootstrap_platform_admin('vandlabsstudio@gmail.com', 'VandLabs', 'release')");
  const admin = await signInWithGoogle(google("g-admin", "vandlabsstudio@gmail.com"));
  if (!admin.ok) throw new Error("bootstrap admin sign-in failed");
  return { h, owner, admin, sid: now() - 100 };
}

test("step-up asks Google to log in again and to report auth_time; normal sign-in asks for neither", () => {
  const input = { redirectUri: REDIRECT, state: "s", scope: "openid email", nonce: "n", verifier: "v".repeat(43), loginHint: "admin@example.com" };
  const stepUp = new URL(googleAuthUrl({ ...input, maxAge: 300, reauthenticate: true }));
  assert.equal(stepUp.searchParams.get("prompt"), "login");
  assert.equal(stepUp.searchParams.get("max_age"), "300");
  assert.equal(stepUp.searchParams.get("login_hint"), "admin@example.com");
  assert.equal(stepUp.searchParams.get("code_challenge_method"), "S256", "PKCE still applies");
  const normal = new URL(googleAuthUrl(input));
  assert.equal(normal.searchParams.get("prompt"), "select_account");
  assert.equal(normal.searchParams.has("max_age"), false);
});

test("successful re-authentication: a fresh confirmation of the bound Google account is accepted", async () => {
  const { h, admin, sid } = await administrator();
  try {
    const issued = (await newOAuthState({ purpose: "reauth", provider: "google", sub: admin.ok ? admin.userId : "", sid, act: "access.decide", res: "" }))!;
    const read = await callback(issued, (nonce) => claimsFor(nonce, { auth_time: now() - 30 }));
    assert.ok(read, "the callback is accepted");
    const check = await checkStepUp(read.state, read.identity, { userId: admin.userId, sessionIssuedAt: sid });
    assert.deepEqual(check, { ok: true, method: "google_auth_time", action: "access.decide", resource: "" });
  } finally { await h.close(); }
});

test("missing auth_time is not a failure: the forced-login authorization is the freshness basis, and it is recorded as that", async () => {
  const { h, admin, sid } = await administrator();
  try {
    const issued = (await newOAuthState({ purpose: "reauth", provider: "google", sub: admin.ok ? admin.userId : "", sid, act: "workspace.websites", res: "" }))!;
    const absent = await callback(issued, (nonce) => claimsFor(nonce));
    assert.ok(absent);
    const check = await checkStepUp(absent.state, absent.identity, { userId: admin.userId, sessionIssuedAt: sid });
    assert.deepEqual(check, { ok: true, method: "google_authorization", action: "workspace.websites", resource: "" }, "recorded as an authorization, not as a verified recent login");

    // A non-numeric auth_time is not a usable value; it is treated as not reported.
    const malformed = await callback(issued, (nonce) => claimsFor(nonce, { auth_time: String(now()) }));
    assert.ok(malformed);
    assert.equal((await checkStepUp(malformed.state, malformed.identity, { userId: admin.userId, sessionIssuedAt: sid })).ok, true);
  } finally { await h.close(); }
});

test("an incorrect Google account cannot confirm, and neither can a confirmation from another session", async () => {
  const { h, admin, sid } = await administrator();
  try {
    const issued = (await newOAuthState({ purpose: "reauth", provider: "google", sub: admin.ok ? admin.userId : "", sid, act: "access.decide", res: "" }))!;
    const other = await callback(issued, (nonce) => claimsFor(nonce, { sub: "g-intruder", email: "intruder@gmail.com", auth_time: now() - 10 }));
    assert.ok(other);
    assert.deepEqual(await checkStepUp(other.state, other.identity, { userId: admin.userId, sessionIssuedAt: sid }), { ok: false, reason: "account_mismatch" });

    const own = await callback(issued, (nonce) => claimsFor(nonce, { auth_time: now() - 10 }));
    assert.ok(own);
    assert.deepEqual(await checkStepUp(own.state, own.identity, { userId: admin.userId, sessionIssuedAt: sid + 1 }), { ok: false, reason: "session_mismatch" });
  } finally { await h.close(); }
});

test("an expired confirmation is refused: old auth_time, expired state, or a missing flow cookie", async () => {
  const { h, admin, sid } = await administrator();
  try {
    const issued = (await newOAuthState({ purpose: "reauth", provider: "google", sub: admin.ok ? admin.userId : "", sid, act: "access.decide", res: "" }))!;
    const stale = await callback(issued, (nonce) => claimsFor(nonce, { auth_time: now() - 3600 }));
    assert.ok(stale);
    assert.deepEqual(await checkStepUp(stale.state, stale.identity, { userId: admin.userId, sessionIssuedAt: sid }), { ok: false, reason: "auth_time_stale" });

    // A state past its lifetime is refused even with a matching cookie.
    const nonce = "expired-nonce-000000000000";
    const verifier = "v".repeat(43);
    const expiredState = await signPayload({ n: nonce, purpose: "reauth", provider: "google", sub: admin.ok ? admin.userId : "", sid, exp: now() - 1 });
    const expiredJar = new Map([[`${OAUTH_COOKIE_PREFIX}${nonce}`, `${nonce}~${verifier}`]]);
    assert.equal(await readGoogleCallback({ state: expiredState, code: "c", redirectUri: REDIRECT, purpose: "reauth", cookie: await flowCookieValue(expiredState, (n) => expiredJar.get(n)), exchange: async () => ({ id_token: idToken(claimsFor(nonce, { auth_time: now() })) }) }), null);

    // No cookie in this browser (for example, the window was opened in another browser): nothing is confirmed.
    assert.equal(await callback(issued, (nonce) => claimsFor(nonce, { auth_time: now() }), new Map()), null);
  } finally { await h.close(); }
});

test("overlapping Google flows in one browser keep separate cookies and both complete", async () => {
  const { h, admin, sid } = await administrator();
  try {
    const signin = (await newOAuthState({ purpose: "signin", provider: "google" }))!;
    const reauth = (await newOAuthState({ purpose: "reauth", provider: "google", sub: admin.ok ? admin.userId : "", sid, act: "access.decide", res: "" }))!;
    // Started after the sign-in: the sign-in's cookie must survive.
    assert.notEqual(await flowCookieName(signin.state), await flowCookieName(reauth.state));
    const jar = jarWith(signin, reauth);
    const done = await callback(signin, (nonce) => claimsFor(nonce, { sub: "g-x", email: "x@gmail.com" }), jar, "signin");
    assert.ok(done, "the earlier flow still completes");
    assert.equal(done.identity.sub, "g-x");
    const confirm = await callback(reauth, (nonce) => claimsFor(nonce, { auth_time: now() - 5 }), jar);
    assert.ok(confirm && (await checkStepUp(confirm.state, confirm.identity, { userId: admin.userId, sessionIssuedAt: sid })).ok);

    // A cookie from one flow never satisfies another flow's state.
    assert.equal(await callback(signin, (nonce) => claimsFor(nonce), new Map([[await flowCookieName(signin.state) as string, reauth.cookie]]), "signin"), null);
  } finally { await h.close(); }
});

test("dealership approval: a fresh confirmation approves once; a rejected one creates nothing; the owner signs in with their own account", async () => {
  const { h, owner, admin, sid } = await administrator();
  try {
    const visitor = google("g-new-dealer", "new.dealer@gmail.com", { name: "Ravi Kumar" });
    assert.deepEqual(await signInWithGoogle(visitor), { ok: false, code: "no_account" });
    const pass = (await newAccessCookie(visitor))!;
    assert.ok(pass);
    const details = validateAccessRequest({ name: "Ravi Kumar", businessName: "Kumar Autos Pvt Ltd", dealershipName: "Kumar Autos", phone: "98470 12345", city: "Pune", state: "Maharashtra", message: "Used SUVs" }).input!;
    assert.equal(await submitAccessRequest(visitor, details), "created");
    const [request] = await listAccessRequests(admin.userId, "pending");

    // Attempt 1: Google reports a sign-in from an hour ago. The confirmation is refused, so decideAccessRequest is never called.
    const rejected = (await newOAuthState({ purpose: "reauth", provider: "google", sub: admin.userId, sid, act: "access.decide", res: "" }))!;
    const stale = await callback(rejected, (nonce) => claimsFor(nonce, { auth_time: now() - 3600 }));
    assert.ok(stale);
    assert.deepEqual(await checkStepUp(stale.state, stale.identity, { userId: admin.userId, sessionIssuedAt: sid }), { ok: false, reason: "auth_time_stale" });
    assert.equal((await accessRequestStatus("g-new-dealer"))?.status, "pending");
    assert.equal((await owner.query("SELECT count(*)::int AS n FROM dealerships WHERE name = 'Kumar Autos Pune'")).rows[0].n, 0);

    // Attempt 2: a fresh confirmation. The approval creates the dealership exactly once.
    const fresh = (await newOAuthState({ purpose: "reauth", provider: "google", sub: admin.userId, sid, act: "access.decide", res: "" }))!;
    const ok = await callback(fresh, (nonce) => claimsFor(nonce, { auth_time: now() - 20 }));
    assert.ok(ok && (await checkStepUp(ok.state, ok.identity, { userId: admin.userId, sessionIssuedAt: sid })).ok);
    const approved = await decideAccessRequest(admin.userId, request.id, { approve: true, dealershipName: "Kumar Autos Pune" });
    assert.ok(approved.tenantId);
    await assert.rejects(decideAccessRequest(admin.userId, request.id, { approve: true, dealershipName: "Kumar Autos Pune" }), /not_pending/, "a repeated approval creates nothing new");
    assert.equal((await owner.query("SELECT count(*)::int AS n FROM dealerships WHERE name = 'Kumar Autos Pune'")).rows[0].n, 1, "created exactly once");

    // The requester signs in with their own Google account; another account gets nothing.
    const signedIn = await signInWithGoogle(visitor);
    assert.ok(signedIn.ok && signedIn.tenantId === approved.tenantId && !signedIn.platformAdmin);
    assert.equal((await resolvePrincipal(signedIn.userId, signedIn.tenantId, now()))?.role, "owner");
    assert.deepEqual(await signInWithGoogle(google("g-stranger", "stranger@gmail.com")), { ok: false, code: "no_account" });
  } finally { await h.close(); }
});

test("the reason a confirmation window failed is recognised and explained; anything unknown falls back to a generic failure", async () => {
  const { STEP_UP_MESSAGES, isStepUpResult } = await import("../../apps/intelligence/lib/step-up-copy");
  assert.equal(isStepUpResult("failed"), true);
  assert.equal(isStepUpResult("setup_required"), false, "the old reason no longer exists");
  assert.equal(isStepUpResult("admin_granted"), false, "unknown values are not trusted");
  assert.doesNotMatch(STEP_UP_MESSAGES.failed, /auth_time|Session age|token/i, "no internal detail reaches the person");
});
