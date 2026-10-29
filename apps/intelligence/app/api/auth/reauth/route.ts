import { NextResponse } from "next/server";
import { problem, readJson } from "@/lib/api";
import { clientKey, hit } from "@/lib/rate-limit";
import { REAUTH_COOKIE, REAUTH_TTL_SECONDS } from "@/lib/session";
import { getPrincipal, newReauthGrant, reauthSecondsLeft } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/csrf";
import { reauthenticate } from "@/lib/server/identity";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const cookieOptions = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" } as const;

/** Whether the signed-in user still holds a valid password confirmation, so screens can skip asking again. */
export async function GET() {
  const seconds = await reauthSecondsLeft();
  return NextResponse.json({ valid: seconds > 0, expiresIn: seconds }, { headers: NO_STORE });
}

/**
 * Step-up confirmation. Verifies the password of the signed-in user only (never an email from the request), then issues a
 * short-lived grant that is bound to that user and to this session. Two-factor stays enforced by the admin gate itself.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Your session has expired. Sign in again.");
  const limit = hit(`reauth:${clientKey(request)}:${current.principal.userId}`, 8, 10 * 60_000);
  if (!limit.allowed) return problem(429, "rate_limited", "Too many attempts. Wait a few minutes and try again.", { retry_after: limit.retryAfter });
  const body = await readJson<{ password?: string }>(request);
  if (typeof body?.password !== "string") return problem(401, "invalid_credentials", "That password is not correct.");
  const result = await reauthenticate(current.principal.userId, body.password);
  if (!result.ok) {
    if (result.code === "locked") return problem(429, "locked", "Too many wrong passwords. Try again in a few minutes.");
    return problem(401, "invalid_credentials", "That password is not correct.");
  }
  const token = await newReauthGrant(current.principal.userId, current.session.iat ?? 0);
  if (!token) return problem(503, "not_configured", "Not configured.");
  const response = NextResponse.json({ ok: true, expiresIn: REAUTH_TTL_SECONDS }, { headers: NO_STORE });
  response.cookies.set(REAUTH_COOKIE, token, { ...cookieOptions, maxAge: REAUTH_TTL_SECONDS });
  return response;
}
