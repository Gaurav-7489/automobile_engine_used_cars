import { signPayload, verifyPayload } from "../session";

/**
 * Google's OAuth 2.0 / OpenID Connect endpoints, shared by "Sign in with Google" and by connecting a Google Ads account.
 * The client secret stays on the server. Every round trip carries a signed, short-lived state value bound to a cookie in the
 * same browser, so a callback cannot be replayed from another session or forged by another site.
 */
export const OAUTH_COOKIE = process.env.NODE_ENV === "production" ? "__Host-vl_oauth" : "vl_oauth";
export const OAUTH_TTL_SECONDS = 10 * 60;

export type OAuthState = { n: string; purpose: "signin" | "ads"; provider: "google" | "meta" | "whatsapp"; returnTo?: string; sub?: string; tid?: string; exp: number };

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

export async function newOAuthState(input: Omit<OAuthState, "n" | "exp">): Promise<{ state: string; nonce: string } | null> {
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString("base64url");
  const state = await signPayload({ ...input, n: nonce, exp: Math.floor(Date.now() / 1000) + OAUTH_TTL_SECONDS } satisfies OAuthState);
  return state ? { state, nonce } : null;
}

/** The state is ours (signature), fresh (expiry), for this flow, and started in this browser (cookie). */
export async function readOAuthState(state: string | null, cookieNonce: string | undefined, purpose: OAuthState["purpose"], provider: OAuthState["provider"]): Promise<OAuthState | null> {
  const payload = await verifyPayload<OAuthState>(state);
  if (!payload || !cookieNonce || payload.n !== cookieNonce || payload.purpose !== purpose || payload.provider !== provider) return null;
  return payload;
}

export const oauthCookie = (value: string, maxAge = OAUTH_TTL_SECONDS) => ({ name: OAUTH_COOKIE, value, httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge });

export function googleAuthUrl(input: { redirectUri: string; state: string; scope: string; nonce?: string; offline?: boolean }): string {
  const p = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!.trim(), redirect_uri: input.redirectUri, response_type: "code", scope: input.scope, state: input.state });
  if (input.nonce) p.set("nonce", input.nonce);
  // Offline access with a forced consent screen is the only way Google reliably returns a refresh token.
  if (input.offline) { p.set("access_type", "offline"); p.set("prompt", "consent"); } else p.set("prompt", "select_account");
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export type GoogleTokens = { access_token?: string; refresh_token?: string; id_token?: string; expires_in?: number; scope?: string };

async function tokenRequest(params: Record<string, string>): Promise<GoogleTokens | null> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, cache: "no-store", signal: AbortSignal.timeout(10_000),
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!.trim(), client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(), ...params }),
  });
  return response.ok ? ((await response.json()) as GoogleTokens) : null;
}

export const exchangeGoogleCode = (code: string, redirectUri: string) => tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
export const refreshGoogleToken = (refreshToken: string) => tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });

export type GoogleIdentity = { sub: string; email: string; name: string };

/**
 * Reads the identity from an ID token that this server received directly from Google's token endpoint over TLS in exchange for
 * the code (OpenID Connect Core 3.1.3.7 allows that channel to stand in for checking the signature). Issuer, audience, expiry,
 * the nonce we issued and a verified email are all required.
 */
export function readGoogleIdToken(idToken: string | undefined, nonce: string): GoogleIdentity | null {
  try {
    const claims = JSON.parse(Buffer.from((idToken ?? "").split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
    const issuer = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
    if (!issuer || claims.aud !== process.env.GOOGLE_CLIENT_ID?.trim() || typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return null;
    if (claims.nonce !== nonce || claims.email_verified !== true || typeof claims.email !== "string" || typeof claims.sub !== "string") return null;
    return { sub: claims.sub, email: claims.email.toLowerCase(), name: typeof claims.name === "string" ? claims.name : "" };
  } catch {
    return null;
  }
}
