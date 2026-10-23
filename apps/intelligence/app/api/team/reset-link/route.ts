import { json, problem, readJson } from "@/lib/api";
import { can } from "@/lib/permissions";
import { getPrincipal } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/csrf";
import { issueReset } from "@/lib/server/identity";

export const dynamic = "force-dynamic";

/** An owner issues a one-time password-reset link for a member of their own workspace. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Sign in to continue.");
  if (!can(current.principal.role, "settings.team")) return problem(403, "forbidden", "Only an owner can issue reset links.");
  const body = await readJson<{ email?: string }>(request);
  if (typeof body?.email !== "string") return problem(422, "invalid", "Choose a member.");
  const issued = await issueReset(current.principal, body.email);
  if (!issued.ok) return problem(404, "not_found", issued.message);
  return json({ ok: true, token: issued.token, expires_at: issued.expiresAt });
}
