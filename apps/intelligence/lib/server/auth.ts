import { cookies } from "next/headers";
import { cache } from "react";
import type { Session } from "../domain";
import { REAUTH_COOKIE, REAUTH_TTL_SECONDS, SESSION_COOKIE, SESSION_TTL_SECONDS, signPayload, signSession, verifyPayload, verifySession } from "../session";
import { resolvePrincipal, type Principal } from "./identity";

export function principalSession(principal: Principal, issuedAt: number, exp: number): Session {
  return { sub: principal.userId, tid: principal.tenantId, name: principal.name, email: principal.email, role: principal.role, branchIds: principal.locationIds, iat: issuedAt, exp };
}

/** Every request re-validates the signed cookie against the database: disabled accounts, revoked sessions and role changes apply at once. */
export const getPrincipal = cache(async (): Promise<{ principal: Principal; session: Session } | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const signed = await verifySession(token);
  if (!signed?.tid || signed.iat === undefined) return null;
  const principal = await resolvePrincipal(signed.sub, signed.tid, signed.iat);
  return principal ? { principal, session: principalSession(principal, signed.iat, signed.exp) } : null;
});

export async function newSessionCookie(userId: string, tenantId: string): Promise<string | null> {
  const iat = Math.floor(Date.now() / 1000);
  return signSession({ sub: userId, tid: tenantId, name: "", email: "", role: "viewer", branchIds: [], iat, exp: iat + SESSION_TTL_SECONDS });
}

/** What a password confirmation grants: tied to one user and the exact session it was made in, so it cannot move between sessions or people. */
export type ReauthGrant = { sub: string; sid: number; scope: "step-up"; exp: number };

export async function newReauthGrant(userId: string, sessionIssuedAt: number): Promise<string | null> {
  return signPayload({ sub: userId, sid: sessionIssuedAt, scope: "step-up", exp: Math.floor(Date.now() / 1000) + REAUTH_TTL_SECONDS } satisfies ReauthGrant);
}

/** Seconds left on the signed-in user's confirmation, or 0 when there is none. */
export async function reauthSecondsLeft(): Promise<number> {
  const current = await getPrincipal();
  if (!current) return 0;
  const grant = await verifyPayload<ReauthGrant>((await cookies()).get(REAUTH_COOKIE)?.value);
  if (!grant || grant.scope !== "step-up" || grant.sub !== current.principal.userId || grant.sid !== current.session.iat) return 0;
  return Math.max(0, grant.exp - Math.floor(Date.now() / 1000));
}

export async function hasRecentReauth(userId: string): Promise<boolean> {
  const current = await getPrincipal();
  return current?.principal.userId === userId && (await reauthSecondsLeft()) > 0;
}
