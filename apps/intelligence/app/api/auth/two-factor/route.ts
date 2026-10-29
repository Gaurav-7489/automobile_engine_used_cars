import { json, problem, rateLimited, readJson } from "@/lib/api";
import { clientKey, hitShared } from "@/lib/rate-limit";
import { getPrincipal, hasRecentReauth } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/csrf";
import { beginTotp, confirmTotp, disableTotp, totpState } from "@/lib/server/identity";
import { otpauthUri } from "@/lib/server/totp";

export const dynamic = "force-dynamic";

export async function GET() {
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Sign in to continue.");
  const state = await totpState(current.principal.userId);
  return json({ enabled: state.enabled });
}

/** Enrol with an authenticator app (begin, then confirm with a code), or switch two-factor off with a current code. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Sign in to continue.");
  const limit = await hitShared(`2fa:${clientKey(request)}:${current.principal.userId}`, 10, 10 * 60_000);
  if (!limit.allowed) return rateLimited("Too many attempts. Wait a few minutes and try again.", limit.retryAfter);
  const body = await readJson<{ action?: string; code?: string }>(request);
  const code = typeof body?.code === "string" ? body.code.replace(/\s/g, "") : "";
  const userId = current.principal.userId;
  if (body?.action === "begin") {
    // Starting enrolment replaces any unconfirmed secret, so it needs a recent password confirmation.
    if (!(await hasRecentReauth(userId))) return problem(403, "reauth_required", "Confirm your password first.");
    const secret = await beginTotp(userId);
    if (!secret) return problem(409, "conflict", "Two-factor authentication is already on.");
    return json({ secret, uri: otpauthUri(secret, current.principal.email) });
  }
  if (body?.action === "confirm") {
    return (await confirmTotp(userId, code)) ? json({ enabled: true }) : problem(422, "invalid", "That code is not correct. Enter the current 6-digit code from the app.");
  }
  if (body?.action === "disable") {
    return (await disableTotp(userId, code)) ? json({ enabled: false }) : problem(422, "invalid", "That code is not correct. Two-factor stays on.");
  }
  return problem(422, "invalid", "Unknown action.");
}
