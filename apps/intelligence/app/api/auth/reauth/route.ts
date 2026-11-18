import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { problem, rateLimited, readJson } from "@/lib/api";
import { clientKey, hitShared } from "@/lib/rate-limit";
import { REAUTH_COOKIE } from "@/lib/session";
import { currentStepUp, getPrincipal, newReauthGrant } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/csrf";
import { reauthenticate } from "@/lib/server/identity";
import { legacyPasswordLogin } from "@/lib/server/legacy-auth";
import { REAUTH_RESULT_COOKIE } from "@/lib/server/google-oauth";
import { isStepUpAction, isStepUpResource, STEP_UP_TTL_SECONDS } from "@/lib/step-up-actions";
import { isStepUpResult } from "@/lib/step-up-copy";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const cookieOptions = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" } as const;

/**
 * What the signed-in user's confirmation state is: which method applies, the reason the last Google window failed (if it did in the
 * last two minutes), and the confirmation they hold, if any. A confirmation is never reported as "valid" in general: it is for one action.
 */
export async function GET() {
  const current = await getPrincipal();
  // "google": confirm in a Google window (/api/auth/sso/google?intent=reauth&action=…). "password": the legacy password confirmation.
  const method = current?.session.amr === "google" || !legacyPasswordLogin() ? "google" : "password";
  const last = (await cookies()).get(REAUTH_RESULT_COOKIE)?.value;
  const confirmation = await currentStepUp();
  return NextResponse.json({ method, lastResult: isStepUpResult(last) ? last : null, confirmation }, { headers: NO_STORE });
}

/**
 * Legacy password confirmation (LEGACY_PASSWORD_LOGIN=enabled only). Verifies the signed-in user's own password, then issues a
 * single-use confirmation for the one action named in the request.
 */
export async function POST(request: Request) {
  if (!legacyPasswordLogin()) return problem(410, "gone", "Confirm with Google instead.");
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Your session has expired. Sign in again.");
  const limit = await hitShared(`reauth:${clientKey(request)}:${current.principal.userId}`, 8, 10 * 60_000);
  if (!limit.allowed) return rateLimited("Too many attempts. Wait a few minutes and try again.", limit.retryAfter);
  const body = await readJson<{ password?: string; action?: string; resource?: string }>(request);
  if (!isStepUpAction(body?.action) || !isStepUpResource(body?.resource ?? "")) return problem(422, "invalid", "Choose the change to confirm.");
  if (typeof body?.password !== "string") return problem(401, "invalid_credentials", "That password is not correct.");
  const result = await reauthenticate(current.principal.userId, body.password);
  if (!result.ok) {
    if (result.code === "locked") return problem(429, "locked", "Too many wrong passwords. Try again in a few minutes.");
    return problem(401, "invalid_credentials", "That password is not correct.");
  }
  const token = await newReauthGrant(current.principal.userId, current.session.iat ?? 0, body.action, body.resource ?? "", "password");
  if (!token) return problem(503, "not_configured", "Not configured.");
  const response = NextResponse.json({ ok: true, expiresIn: STEP_UP_TTL_SECONDS }, { headers: NO_STORE });
  response.cookies.set(REAUTH_COOKIE, token, { ...cookieOptions, maxAge: STEP_UP_TTL_SECONDS });
  return response;
}
