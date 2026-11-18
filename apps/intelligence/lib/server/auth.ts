import { cookies, headers } from "next/headers";
import { cache } from "react";
import type { Session } from "../domain";
import { REAUTH_COOKIE, SESSION_COOKIE, SESSION_TTL_SECONDS, signPayload, signSession, verifyPayload, verifySession } from "../session";
import { STEP_UP_TTL_SECONDS, type StepUpAction } from "../step-up-actions";
import { plain } from "./db";
import { resolvePrincipal, type Principal } from "./identity";

export function principalSession(principal: Principal, issuedAt: number, exp: number, amr?: Session["amr"]): Session {
  return { sub: principal.userId, tid: principal.tenantId, name: principal.name, email: principal.email, role: principal.role, branchIds: principal.locationIds, iat: issuedAt, exp, amr };
}

/** Every request re-validates the signed cookie against the database: disabled accounts, revoked sessions and role changes apply at once. */
export const getPrincipal = cache(async (): Promise<{ principal: Principal; session: Session } | null> => {
  // Browsers present the session cookie. The desktop application presents the same signed session as a bearer token (it has no cookie jar),
  // so both are validated identically: against the database, on every request.
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? /^Bearer ([\w.-]{20,2000})$/.exec((await headers()).get("authorization") ?? "")?.[1];
  const signed = await verifySession(token);
  if (!signed?.tid || signed.iat === undefined) return null;
  const principal = await resolvePrincipal(signed.sub, signed.tid, signed.iat);
  return principal ? { principal, session: principalSession(principal, signed.iat, signed.exp, signed.amr) } : null;
});

export async function newSessionCookie(userId: string, tenantId: string, amr: Session["amr"] = "password"): Promise<string | null> {
  const iat = Math.floor(Date.now() / 1000);
  return signSession({ sub: userId, tid: tenantId, name: "", email: "", role: "viewer", branchIds: [], iat, exp: iat + SESSION_TTL_SECONDS, amr });
}

/**
 * A step-up confirmation: permission for ONE sensitive action on ONE resource, for this user and this exact session, usable once.
 * `method` records how it was obtained: a fresh Google sign-in that reported its authentication time ("google_auth_time"), or a fresh
 * Google authorization that Google was required to complete interactively (prompt=login) without reporting a time
 * ("google_authorization"), or the legacy password ("password"). It is never described as a recent Google login unless Google said so.
 */
export type StepUpMethod = "google_auth_time" | "google_authorization" | "password";
export type StepUpGrant = { sub: string; sid: number; scope: "step-up"; act: StepUpAction; res: string; method: StepUpMethod; jti: string; iat: number; exp: number };

export async function newReauthGrant(userId: string, sessionIssuedAt: number, action: StepUpAction, resource: string, method: StepUpMethod): Promise<string | null> {
  const iat = Math.floor(Date.now() / 1000);
  const jti = Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString("base64url");
  return signPayload({ sub: userId, sid: sessionIssuedAt, scope: "step-up", act: action, res: resource, method, jti, iat, exp: iat + STEP_UP_TTL_SECONDS } satisfies StepUpGrant);
}

/** The confirmation the signed-in user holds, if any, without using it. The screen uses it to show the Google window has finished. */
export async function currentStepUp(): Promise<{ action: StepUpAction; resource: string; expiresIn: number } | null> {
  const current = await getPrincipal();
  if (!current) return null;
  const grant = await verifyPayload<StepUpGrant>((await cookies()).get(REAUTH_COOKIE)?.value);
  if (!grant || grant.scope !== "step-up" || grant.sub !== current.principal.userId || grant.sid !== (current.session.iat ?? 0)) return null;
  const expiresIn = grant.exp - Math.floor(Date.now() / 1000);
  return expiresIn > 0 ? { action: grant.act, resource: grant.res, expiresIn } : null;
}

/**
 * Uses the confirmation for exactly this action and resource, once. Returns false when there is none, it belongs to another user or
 * session, it names another action or resource, it has expired, or it was already used. The use is recorded in the database, so two
 * requests racing with the same confirmation cannot both succeed.
 */
export async function consumeStepUp(userId: string, action: StepUpAction, resource = ""): Promise<boolean> {
  const current = await getPrincipal();
  if (!current || current.principal.userId !== userId) return false;
  const grant = await verifyPayload<StepUpGrant>((await cookies()).get(REAUTH_COOKIE)?.value);
  if (!grant || grant.scope !== "step-up" || grant.sub !== userId || grant.sid !== (current.session.iat ?? 0)) return false;
  if (grant.act !== action || grant.res !== resource || typeof grant.jti !== "string" || grant.exp <= Math.floor(Date.now() / 1000)) return false;
  const row = (await plain((c) => c.query("SELECT intelligence_step_up_consume($1, $2) AS ok", [grant.jti, new Date(grant.exp * 1000).toISOString()]))).rows[0] as { ok: boolean } | undefined;
  return row?.ok === true;
}
