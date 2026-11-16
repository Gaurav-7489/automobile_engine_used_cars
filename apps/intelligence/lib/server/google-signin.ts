import { plain } from "./db";
import { exchangeGoogleCode, readGoogleIdToken, readOAuthCookie, readOAuthState, type GoogleIdentity, type OAuthState } from "./google-oauth";

/**
 * The Google sign-in decision, with no Next.js request APIs, so it can be tested end to end with a stand-in token endpoint.
 * Nobody gains access by having a Google account: the stable subject id must already be bound to a member, or the verified email
 * must match an identity VandLabs (or an owner's invitation) approved. See migration 0024.
 */

export type GoogleSignInOutcome =
  | { ok: true; userId: string; tenantId: string; platformAdmin: boolean; identity: GoogleIdentity }
  | { ok: false; code: "no_account" | "disabled" | "conflict" | "admin_not_approved" | "link_not_approved" | "no_access" };

export async function signInWithGoogle(identity: GoogleIdentity): Promise<GoogleSignInOutcome> {
  const row = (await plain((c) => c.query("SELECT * FROM intelligence_google_signin($1, $2, $3, $4)", [identity.sub, identity.email, identity.name, identity.authoritative]))).rows[0] as
    { outcome: string; user_id: string | null; tenant_id: string | null; platform_admin: boolean } | undefined;
  if (row?.outcome === "ok" && row.user_id && row.tenant_id) return { ok: true, userId: row.user_id, tenantId: row.tenant_id, platformAdmin: row.platform_admin === true, identity };
  const code = (["disabled", "conflict", "admin_not_approved", "link_not_approved", "no_access"] as const).find((c) => c === row?.outcome) ?? "no_account";
  return { ok: false, code };
}

export async function googleSubOf(userId: string): Promise<string | null> {
  const row = (await plain((c) => c.query("SELECT intelligence_google_sub_of($1) AS sub", [userId]))).rows[0] as { sub: string | null } | undefined;
  return row?.sub ?? null;
}

type Exchange = (code: string, redirectUri: string, verifier?: string) => Promise<{ id_token?: string } | null>;

/** Validates the callback (state, cookie, PKCE verifier, code) and reads the verified Google identity. */
export async function readGoogleCallback(input: { state: string | null; code: string | null; cookie: string | undefined; redirectUri: string; purpose: "signin" | "reauth"; exchange?: Exchange }): Promise<{ state: OAuthState; identity: GoogleIdentity } | null> {
  // Which step failed is logged (never the code, tokens or email), so a misconfiguration is visible in the runtime logs.
  const why = (reason: string) => { console.warn(JSON.stringify({ event: "google_callback_rejected", purpose: input.purpose, reason })); return null; };
  const state = await readOAuthState(input.state, input.cookie, input.purpose, "google");
  const cookie = readOAuthCookie(input.cookie);
  if (!input.cookie) return why("no_state_cookie");
  if (!state) return why("state_invalid_or_expired");
  if (!cookie?.verifier) return why("no_pkce_verifier");
  if (!input.code || input.code.length > 2000) return why("no_code");
  const tokens = await (input.exchange ?? exchangeGoogleCode)(input.code, input.redirectUri, cookie.verifier);
  if (!tokens?.id_token) return why("token_exchange_failed");
  const identity = readGoogleIdToken(tokens.id_token, state.n);
  return identity ? { state, identity } : why("id_token_rejected");
}

export const STEP_UP_MAX_AGE_SECONDS = 300;

/**
 * Step-up (fresh) authentication: the Google account that just authenticated is the one bound to the signed-in user, it is the
 * same session that asked, and Google reports it authenticated within the last few minutes.
 */
export async function verifyStepUp(state: OAuthState, identity: GoogleIdentity, current: { userId: string; sessionIssuedAt: number }, nowSeconds = Math.floor(Date.now() / 1000)): Promise<boolean> {
  const reject = (reason: string) => {
    console.warn(JSON.stringify({ event: "google_reauth_rejected", reason }));
    return false;
  };
  if (state.sub !== current.userId || state.sid !== current.sessionIssuedAt) return reject("session_mismatch");
  if (identity.authTime === undefined) return reject("auth_time_missing");
  if (!Number.isSafeInteger(identity.authTime) || nowSeconds - identity.authTime > STEP_UP_MAX_AGE_SECONDS + 60 || identity.authTime > nowSeconds + 60) return reject("auth_time_invalid_or_stale");
  const bound = await googleSubOf(current.userId);
  return bound !== null && bound === identity.sub ? true : reject("account_mismatch");
}
