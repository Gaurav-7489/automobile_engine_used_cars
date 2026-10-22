import { demoPassword, safeEqual } from "@/lib/auth-users";
import { currentSession, json, problem, readJson } from "@/lib/api";
import { clientKey, hit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Re-authentication for privilege escalation, API keys and revocations. It confirms the password of the signed-in user only. */
export async function POST(request: Request) {
  const session = await currentSession();
  if (!session) return problem(401, "unauthenticated", "Sign in to continue.");
  const limit = hit(`reauth:${clientKey(request)}:${session.sub}`, 6, 10 * 60_000);
  if (!limit.allowed) return problem(429, "rate_limited", "Too many attempts. Wait a few minutes and try again.", { retry_after: limit.retryAfter });
  const body = await readJson<{ password?: string }>(request);
  const expected = demoPassword();
  if (!expected || typeof body?.password !== "string" || !safeEqual(body.password, expected)) return problem(401, "invalid_credentials", "That password is not correct.");
  return json({ ok: true });
}
