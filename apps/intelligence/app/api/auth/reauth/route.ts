import { NextResponse } from "next/server";
import { problem, readJson } from "@/lib/api";
import { clientKey, hit } from "@/lib/rate-limit";
import { REAUTH_COOKIE, REAUTH_TTL_SECONDS, signPayload } from "@/lib/session";
import { getPrincipal } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/csrf";
import { signIn } from "@/lib/server/identity";

export const dynamic = "force-dynamic";

/** Re-authentication for privilege escalation and revocations. It confirms the password of the signed-in user only, and is remembered for ten minutes in a signed cookie. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Sign in to continue.");
  const limit = hit(`reauth:${clientKey(request)}:${current.principal.userId}`, 6, 10 * 60_000);
  if (!limit.allowed) return problem(429, "rate_limited", "Too many attempts. Wait a few minutes and try again.", { retry_after: limit.retryAfter });
  const body = await readJson<{ password?: string }>(request);
  if (typeof body?.password !== "string") return problem(401, "invalid_credentials", "That password is not correct.");
  const result = await signIn(current.principal.email, body.password);
  if (!result.ok || result.userId !== current.principal.userId) return problem(401, "invalid_credentials", "That password is not correct.");
  const token = await signPayload({ sub: current.principal.userId, exp: Math.floor(Date.now() / 1000) + REAUTH_TTL_SECONDS });
  if (!token) return problem(503, "not_configured", "Not configured.");
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(REAUTH_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: REAUTH_TTL_SECONDS });
  return response;
}
