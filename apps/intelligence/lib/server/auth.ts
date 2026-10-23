import { cookies } from "next/headers";
import { cache } from "react";
import type { Session } from "../domain";
import { REAUTH_COOKIE, SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifyPayload, verifySession } from "../session";
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

export async function hasRecentReauth(userId: string): Promise<boolean> {
  const payload = await verifyPayload<{ sub: string; exp: number }>((await cookies()).get(REAUTH_COOKIE)?.value);
  return payload?.sub === userId;
}
