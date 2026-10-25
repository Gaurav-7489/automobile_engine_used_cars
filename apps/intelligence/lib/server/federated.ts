import { createHash, randomBytes } from "node:crypto";
import { resolveFederatedUser } from "@vandlabs/data/federated-identity";
import { withBase } from "../base-path";
import { signPayload, verifyPayload } from "../session";
import { pool } from "./db";
import { federatedSignIn, normalizeEmail, redeemToken, tokenInfo, type SignIn } from "./identity";

/** Single sign-in through the shared Cognito user pool (Google is a federated provider there). */
export const SSO_STATE_COOKIE = process.env.NODE_ENV === "production" ? "__Host-vl_sso" : "vl_sso";
const STATE_TTL_SECONDS = 10 * 60;
const PROVIDERS: Record<string, string> = { google: "Google" };

export type SsoConfig = { origin: string; domain: string; clientId: string };

/** Null when single sign-in is not configured: the sign-in page then simply does not offer it. */
export function ssoConfig(env: Record<string, string | undefined> = process.env): SsoConfig | null {
  const { APP_ORIGIN, COGNITO_DOMAIN, INTELLIGENCE_COGNITO_CLIENT_ID } = env;
  if (!APP_ORIGIN || !COGNITO_DOMAIN || !INTELLIGENCE_COGNITO_CLIENT_ID) return null;
  try {
    const origin = new URL(APP_ORIGIN), domain = new URL(COGNITO_DOMAIN);
    const local = origin.hostname === "127.0.0.1" || origin.hostname === "localhost";
    if (domain.protocol !== "https:" || domain.username || domain.password) return null;
    if (origin.protocol !== "https:" && !(local && env.NODE_ENV !== "production")) return null;
    return { origin: origin.origin, domain: domain.origin, clientId: INTELLIGENCE_COGNITO_CLIENT_ID };
  } catch {
    return null;
  }
}

export const ssoProviders = (): { id: "google"; label: string }[] => (ssoConfig() ? [{ id: "google", label: "Continue with Google" }] : []);
export const callbackUrl = (config: SsoConfig, provider: string) => `${config.origin}${withBase(`/api/auth/sso/${provider}/callback`)}`;

type Flow = { state: string; verifier: string; provider: string; returnTo: string; invite?: string; exp: number };

/** Builds the authorization redirect and the signed, short-lived state cookie value (PKCE + anti-CSRF state). */
export async function beginSso(config: SsoConfig, provider: string, returnTo: string, invite?: string): Promise<{ url: string; cookie: string; maxAge: number } | null> {
  const identityProvider = PROVIDERS[provider];
  if (!identityProvider) return null;
  const verifier = randomBytes(32).toString("base64url"), state = randomBytes(32).toString("base64url");
  const cookie = await signPayload({ state, verifier, provider, returnTo, invite, exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS } satisfies Flow);
  if (!cookie) return null;
  const url = new URL(config.domain + "/oauth2/authorize");
  url.search = new URLSearchParams({
    response_type: "code", client_id: config.clientId, redirect_uri: callbackUrl(config, provider), scope: "openid email profile", state,
    code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url"), identity_provider: identityProvider,
  }).toString();
  return { url: url.toString(), cookie, maxAge: STATE_TTL_SECONDS };
}

export type SsoFailure = "state" | "provider" | "unverified" | "no_access" | "invite_mismatch" | "unavailable";
export type SsoResult = { ok: true; userId: string; tenantId: string; returnTo: string } | { ok: false; reason: SsoFailure };

async function json(response: Response): Promise<Record<string, unknown> | null> {
  if (!response.ok) return null;
  const value: unknown = await response.json().catch(() => null);
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/**
 * Completes the handshake: verifies the state cookie, exchanges the code (PKCE), reads the profile from Cognito,
 * requires a provider-verified email, and signs in only an existing (or invited) member. It never creates an
 * account for an unknown address.
 */
export async function completeSso(config: SsoConfig, provider: string, params: URLSearchParams, stateCookie: string | undefined, fetcher: typeof fetch = fetch): Promise<SsoResult> {
  const flow = await verifyPayload<Flow>(stateCookie);
  const state = params.get("state") ?? "", code = params.get("code");
  if (!flow || flow.provider !== provider || !code || state.length !== flow.state.length || !constantEquals(state, flow.state)) return { ok: false, reason: "state" };
  let profile: { sub: string; email: string; verified: boolean };
  try {
    const tokens = await json(await fetcher(config.domain + "/oauth2/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(10_000), cache: "no-store", redirect: "error",
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: config.clientId, code, code_verifier: flow.verifier, redirect_uri: callbackUrl(config, provider) }),
    }));
    if (typeof tokens?.access_token !== "string") return { ok: false, reason: "provider" };
    const info = await json(await fetcher(config.domain + "/oauth2/userInfo", { headers: { authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(10_000), cache: "no-store", redirect: "error" }));
    if (typeof info?.sub !== "string" || !info.sub) return { ok: false, reason: "provider" };
    profile = { sub: info.sub, email: typeof info.email === "string" ? normalizeEmail(info.email) : "", verified: info.email_verified === true || info.email_verified === "true" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (!profile.verified || !profile.email) return { ok: false, reason: "unverified" };
  try {
    if (flow.invite) {
      // An invitation can be accepted with Google only by the address it was issued to.
      const info = await tokenInfo(flow.invite);
      if (!info || info.kind !== "invite" || normalizeEmail(info.email) !== profile.email) return { ok: false, reason: "invite_mismatch" };
      // The account gets an unguessable password nobody sees; the owner can issue a reset link if one is ever wanted.
      const redeemed = await redeemToken(flow.invite, randomBytes(24).toString("base64url") + "aA1!");
      if (!redeemed.ok) return { ok: false, reason: "invite_mismatch" };
    }
    const userId = await resolveFederatedUser(await pool(), profile.sub, profile.email);
    if (!userId) return { ok: false, reason: "no_access" };
    const target: SignIn = await federatedSignIn(userId);
    return target.ok ? { ok: true, userId, tenantId: target.tenantId, returnTo: flow.returnTo } : { ok: false, reason: "no_access" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

function constantEquals(a: string, b: string): boolean {
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
