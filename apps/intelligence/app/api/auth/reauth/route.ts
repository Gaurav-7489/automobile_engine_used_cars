import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { problem, rateLimited, readJson } from "@/lib/api";
import { clientKey, hitShared } from "@/lib/rate-limit";
import { REAUTH_COOKIE, REAUTH_TTL_SECONDS } from "@/lib/session";
import { getPrincipal, newReauthGrant, reauthSecondsLeft } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/csrf";
import { reauthenticate } from "@/lib/server/identity";
import { legacyPasswordLogin } from "@/lib/server/legacy-auth";
import { REAUTH_RESULT_COOKIE } from "@/lib/server/google-oauth";
import { isStepUpResult } from "@/lib/step-up-copy";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const cookieOptions = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" } as const;

/** Whether the signed-in user still holds a valid password confirmation, so screens can skip asking again. */
export async function GET() {
  const seconds = await reauthSecondsLeft();
  const current = await getPrincipal();
  // "google": confirm in a Google window (/api/auth/sso/google?intent=reauth). "password": the legacy password confirmation.
  const method = current?.session.amr === "google" || !legacyPasswordLogin() ? "google" : "password";
  // The reason the last confirmation window failed, if one did in the last two minutes (see the callback).
  const last = (await cookies()).get(REAUTH_RESULT_COOKIE)?.value;
  return NextResponse.json({ valid: seconds > 0, expiresIn: seconds, method, lastResult: isStepUpResult(last) ? last : null }, { headers: NO_STORE });
}

/**
 * Step-up confirmation. Verifies the password of the signed-in user only (never an email from the request), then issues a
 * short-lived grant that is bound to that user and to this session. Two-factor stays enforced by the admin gate itself.
 */
export async function POST(request: Request) {
  if (!legacyPasswordLogin()) return problem(410, "gone", "Confirm with Google instead.");
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Your session has expired. Sign in again.");
  const limit = await hitShared(`reauth:${clientKey(request)}:${current.principal.userId}`, 8, 10 * 60_000);
  if (!limit.allowed) return rateLimited("Too many attempts. Wait a few minutes and try again.", limit.retryAfter);
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
