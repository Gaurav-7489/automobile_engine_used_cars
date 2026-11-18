import { createHash } from "node:crypto";
import { signPayload, verifyPayload } from "../session";

/**
 * Google's OAuth 2.0 / OpenID Connect endpoints, shared by "Sign in with Google" and by connecting a Google Ads account.
 * The client secret stays on the server. Every round trip carries a signed, short-lived state value bound to a cookie in the
 * same browser, so a callback cannot be replayed from another session or forged by another site.
 */
/**
 * Each round trip has its own cookie, named by its nonce. Two flows in one browser (say, a sign-in and a confirmation window) can
 * therefore run at the same time without one overwriting the other's PKCE verifier.
 */
export const OAUTH_COOKIE_PREFIX = process.env.NODE_ENV === "production" ? "__Host-vl_oauth_" : "vl_oauth_";
export const OAUTH_TTL_SECONDS = 10 * 60;
/** Why the last confirmation window failed. The window cannot always reach the page that opened it, so the page reads this instead. */
export const REAUTH_RESULT_COOKIE = process.env.NODE_ENV === "production" ? "__Host-vl_reauth_result" : "vl_reauth_result";

/** `act`/`res` (step-up only) name the one action and resource the confirmation is for. They are inside the signature, so Google cannot change them. */
export type OAuthState = { n: string; purpose: "signin" | "reauth" | "ads"; provider: "google" | "meta" | "whatsapp"; returnTo?: string; sub?: string; tid?: string; sid?: number; act?: string; res?: string; exp: number };

/** The cookie that belongs to one flow. The nonce is inside the signed state, so it is read only after the state verifies. */
export const oauthCookieName = (nonce: string) => `${OAUTH_COOKIE_PREFIX}${nonce}`;

export const googleConfigured = (): boolean => Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());

/** The public address of this deployment. APP_ORIGIN wins, so a forged Host header cannot move the redirect address. */
export function appOrigin(request: Request): string {
  const configured = process.env.APP_ORIGIN?.trim().replace(/\/$/, "");
  if (configured) return configured;
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

const random = (bytes: number) => Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("base64url");

/** RFC 7636 S256 code challenge for a verifier. */
export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/**
 * A new round trip: signed state (carries the nonce), plus a PKCE verifier that never leaves this server and the browser's
 * httpOnly cookie. The cookie value is `<nonce>~<verifier>`; the state in the URL holds only the nonce.
 */
export async function newOAuthState(input: Omit<OAuthState, "n" | "exp">): Promise<{ state: string; nonce: string; verifier: string; cookie: string } | null> {
  const nonce = random(24);
  const verifier = random(48);
  const state = await signPayload({ ...input, n: nonce, exp: Math.floor(Date.now() / 1000) + OAUTH_TTL_SECONDS } satisfies OAuthState);
  return state ? { state, nonce, verifier, cookie: `${nonce}~${verifier}` } : null;
}

/** Splits the OAuth cookie. Older cookies (before PKCE) hold only the nonce. */
export function readOAuthCookie(value: string | undefined): { nonce: string; verifier?: string } | null {
  if (!value) return null;
  const [nonce, verifier] = value.split("~");
  return nonce ? { nonce, verifier: verifier || undefined } : null;
}

/**
 * The cookie value for the flow named in a state token. The state must verify first: its nonce (inside the signature) selects the
 * cookie, so a forged or expired state never reads anyone's cookie.
 */
export async function flowCookieName(state: string | null): Promise<string | null> {
  const payload = await verifyPayload<OAuthState>(state);
  return payload ? oauthCookieName(payload.n) : null;
}

export async function flowCookieValue(state: string | null, get: (name: string) => string | undefined): Promise<string | undefined> {
  const name = await flowCookieName(state);
  return name ? get(name) : undefined;
}

/** The state is ours (signature), fresh (expiry), for this flow, and started in this browser (cookie). */
export async function readOAuthState(state: string | null, cookieValue: string | undefined, purpose: OAuthState["purpose"], provider: OAuthState["provider"]): Promise<OAuthState | null> {
  const payload = await verifyPayload<OAuthState>(state);
  const cookie = readOAuthCookie(cookieValue);
  if (!payload || !cookie || payload.n !== cookie.nonce || payload.purpose !== purpose || payload.provider !== provider) return null;
  return payload;
}

export const oauthCookie = (name: string, value: string, maxAge = OAUTH_TTL_SECONDS) => ({ name, value, httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge });

/**
 * Builds the authorization request. Step-up (`reauthenticate`) asks Google for a fresh interactive sign-in (`prompt=login`, plus `max_age`).
 * The callback accepts a recent `auth_time` when Google reports one, and otherwise relies on the forced sign-in; it never assumes freshness.
 */
export function googleAuthUrl(input: { redirectUri: string; state: string; scope: string; nonce?: string; offline?: boolean; verifier?: string; maxAge?: number; loginHint?: string; reauthenticate?: boolean }): string {
  const p = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!.trim(), redirect_uri: input.redirectUri, response_type: "code", scope: input.scope, state: input.state });
  if (input.nonce) p.set("nonce", input.nonce);
  if (input.verifier) { p.set("code_challenge", pkceChallenge(input.verifier)); p.set("code_challenge_method", "S256"); }
  // Step-up: Google asks the person to authenticate again unless they did within max_age seconds. auth_time is not requested as an
  // essential claim: where Google does not report it, the forced sign-in itself is the freshness basis (see checkStepUp).
  if (input.maxAge !== undefined) p.set("max_age", String(input.maxAge));
  if (input.loginHint) p.set("login_hint", input.loginHint);
  // Offline access with a forced consent screen is the only way Google reliably returns a refresh token.
  if (input.offline) { p.set("access_type", "offline"); p.set("prompt", "consent"); }
  else if (input.reauthenticate) p.set("prompt", "login");
  else p.set("prompt", "select_account");
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export type GoogleTokens = { access_token?: string; refresh_token?: string; id_token?: string; expires_in?: number; scope?: string };

async function tokenRequest(params: Record<string, string>): Promise<GoogleTokens | null> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, cache: "no-store", signal: AbortSignal.timeout(10_000),
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!.trim(), client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(), ...params }),
  });
  if (!response.ok) {
    // Google's error code only (e.g. invalid_client, redirect_uri_mismatch, invalid_grant); never the request or tokens.
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    console.warn(JSON.stringify({ event: "google_token_error", status: response.status, error: typeof body.error === "string" ? body.error.slice(0, 60) : "unknown" }));
    return null;
  }
  return (await response.json()) as GoogleTokens;
}

export const exchangeGoogleCode = (code: string, redirectUri: string, verifier?: string) => tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code", ...(verifier ? { code_verifier: verifier } : {}) });
export const refreshGoogleToken = (refreshToken: string) => tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });

export type GoogleIdentity = { sub: string; email: string; name: string; hd?: string; authTime?: number; authoritative: boolean };

/** Addresses Google itself issues; for these, a verified email cannot belong to anyone but the account holder. */
const GOOGLE_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * Reads the identity from an ID token that this server received directly from Google's token endpoint over TLS in exchange for
 * the code (OpenID Connect Core 3.1.3.7 allows that channel to stand in for checking the signature; the code itself is bound to
 * this browser by PKCE). Required: Google issuer, our client as audience (and authorized party when present), unexpired, not
 * issued in the future, the nonce we issued, a stable subject and a Google-verified email.
 */
export function readGoogleIdToken(idToken: string | undefined, nonce: string, nowMs = Date.now()): GoogleIdentity | null {
  try {
    const parts = (idToken ?? "").split(".");
    if (parts.length !== 3) return null;
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
    const client = process.env.GOOGLE_CLIENT_ID?.trim();
    const issuer = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
    const audience = typeof claims.aud === "string" ? claims.aud === client : Array.isArray(claims.aud) && claims.aud.length === 1 && claims.aud[0] === client;
    if (!client || !issuer || !audience) return null;
    if (claims.azp !== undefined && claims.azp !== client) return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 < nowMs) return null;
    if (typeof claims.iat === "number" && claims.iat * 1000 > nowMs + 5 * 60_000) return null;
    if (claims.nonce !== nonce || claims.email_verified !== true || typeof claims.email !== "string" || typeof claims.sub !== "string" || !/^[0-9A-Za-z_-]{1,255}$/.test(claims.sub)) return null;
    const email = claims.email.trim().toLowerCase();
    const domain = email.split("@")[1] ?? "";
    const hd = typeof claims.hd === "string" ? claims.hd.toLowerCase() : undefined;
    return {
      sub: claims.sub, email, name: typeof claims.name === "string" ? claims.name.slice(0, 120) : "", hd,
      authTime: typeof claims.auth_time === "number" ? claims.auth_time : undefined,
      authoritative: GOOGLE_DOMAINS.has(domain) || (hd !== undefined && hd === domain),
    };
  } catch {
    return null;
  }
}
