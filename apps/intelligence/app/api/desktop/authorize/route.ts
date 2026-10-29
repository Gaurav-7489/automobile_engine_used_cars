import { json, problem, rateLimited, readJson } from "@/lib/api";
import { clientKey, hitShared } from "@/lib/rate-limit";
import { getPrincipal } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/csrf";
import { desktopEnabled, issueCode } from "@/lib/server/desktop";

export const dynamic = "force-dynamic";

/** The signed-in person approves a desktop sign-in; the browser session itself (with its MFA) is what authorizes it. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  if (request.headers.get("authorization")) return problem(403, "forbidden", "Approve desktop sign-in from the browser.");
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Sign in to continue.");
  const limit = await hitShared(`desktop-authorize:${current.principal.userId}:${clientKey(request)}`, 10, 10 * 60_000);
  if (!limit.allowed) return rateLimited("Too many sign-in approvals. Wait a few minutes.", limit.retryAfter);
  const enabled = await desktopEnabled(current.principal.tenantId);
  if (!enabled.ok) return problem(403, "not_entitled", enabled.reason);
  const body = await readJson<{ challenge?: unknown }>(request, 2_000);
  const code = await issueCode(current.principal.userId, current.principal.tenantId, body?.challenge);
  return code ? json({ code }) : problem(422, "invalid", "This sign-in request is not valid. Start again from the desktop application.");
}
