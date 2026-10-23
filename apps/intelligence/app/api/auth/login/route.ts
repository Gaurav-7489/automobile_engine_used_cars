import { NextResponse } from "next/server";
import { problem, readJson } from "@/lib/api";
import { clientKey, hit } from "@/lib/rate-limit";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, safeReturnTo } from "@/lib/session";
import { newSessionCookie } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/csrf";
import { signIn } from "@/lib/server/identity";

export const dynamic = "force-dynamic";

const GENERIC = "Email or password is not correct. Check both and try again.";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const body = await readJson<{ email?: string; password?: string; returnTo?: string }>(request);
  if (!body || typeof body.email !== "string" || typeof body.password !== "string") return problem(422, "invalid", "Enter your business email and password.");
  const email = body.email.trim().toLowerCase();
  // Per-address and per-client limits on top of the database lockout (five failures lock the account for 15 minutes).
  const limit = hit(`login:${clientKey(request)}:${email}`, 8, 10 * 60_000);
  const ipLimit = hit(`login-ip:${clientKey(request)}`, 40, 10 * 60_000);
  if (!limit.allowed || !ipLimit.allowed) {
    return problem(429, "rate_limited", `Too many sign-in attempts. Wait ${Math.ceil(Math.max(limit.retryAfter, ipLimit.retryAfter) / 60)} minutes and try again.`, { retry_after: Math.max(limit.retryAfter, ipLimit.retryAfter) });
  }
  let result;
  try {
    result = await signIn(email, body.password);
  } catch (error) {
    console.error(JSON.stringify({ event: "login_failure", message: error instanceof Error ? error.message : "unknown" }));
    return problem(503, "unavailable", "Sign-in is temporarily unavailable. Try again in a moment.");
  }
  if (!result.ok) {
    if (result.code === "locked") return problem(429, "locked", "This account is temporarily locked after repeated failed attempts. Try again in 15 minutes, or ask an owner to issue a reset link.");
    if (result.code === "no_access") return problem(403, "no_access", "Your account is not a member of any workspace. Ask your owner to invite you.");
    return problem(401, "invalid_credentials", GENERIC);
  }
  const token = await newSessionCookie(result.userId, result.tenantId);
  if (!token) return problem(503, "not_configured", "Sign-in is not configured for this environment. Ask your administrator.");
  const response = NextResponse.json({ ok: true, returnTo: safeReturnTo(body.returnTo), user: { name: result.name } }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_TTL_SECONDS });
  return response;
}
