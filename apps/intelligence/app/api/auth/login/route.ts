import { NextResponse } from "next/server";
import { demoMfaCode, demoPassword, directory, safeEqual } from "@/lib/auth-users";
import { problem, readJson } from "@/lib/api";
import { clientKey, hit } from "@/lib/rate-limit";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, safeReturnTo, signSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const GENERIC = "Email or password is not correct. Check both and try again.";

export async function POST(request: Request) {
  const body = await readJson<{ email?: string; password?: string; mfa?: string; returnTo?: string }>(request);
  if (!body || typeof body.email !== "string" || typeof body.password !== "string") return problem(422, "invalid", "Enter your business email and password.");
  const email = body.email.trim().toLowerCase();
  const limit = hit(`login:${clientKey(request)}:${email}`, 6, 10 * 60_000);
  if (!limit.allowed) {
    return problem(429, "rate_limited", `Too many sign-in attempts. Wait ${Math.ceil(limit.retryAfter / 60)} minutes, or use Forgot password to reset.`, { retry_after: limit.retryAfter });
  }
  const user = directory().find((u) => u.email.toLowerCase() === email);
  const password = demoPassword();
  if (!password) return problem(503, "not_configured", "Sign-in is not configured for this environment. Ask your administrator.");
  // Always compare, even for unknown accounts, so timing does not reveal whether an account exists.
  const passwordOk = safeEqual(body.password, password);
  if (!user || !passwordOk) return problem(401, "invalid_credentials", GENERIC);
  if (user.mfa) {
    if (!body.mfa) return problem(428, "mfa_required", "Enter the 6-digit code from your authenticator app.");
    if (!safeEqual(body.mfa.trim(), demoMfaCode())) return problem(401, "mfa_invalid", "That code is not correct or has expired. Enter the latest code.");
  }
  const token = await signSession({ sub: user.sub, name: user.name, email: user.email, role: user.role, branchIds: user.branchIds, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS });
  if (!token) return problem(503, "not_configured", "Sign-in is not configured for this environment. Ask your administrator.");
  const response = NextResponse.json({ ok: true, returnTo: safeReturnTo(body.returnTo), user: { name: user.name, role: user.role } }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_TTL_SECONDS });
  return response;
}
