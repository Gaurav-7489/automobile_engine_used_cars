import { NextResponse } from "next/server";
import { clientKey, hit } from "@/lib/rate-limit";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/session";
import { newSessionCookie } from "@/lib/server/auth";
import { SSO_STATE_COOKIE, completeSso, ssoConfig } from "@/lib/server/federated";

export const dynamic = "force-dynamic";

function failure(request: Request, reason: string) {
  const response = NextResponse.redirect(new URL(`/login?sso_error=${reason}&provider=google`, request.url), 303);
  response.cookies.set(SSO_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

export async function GET(request: Request) {
  const config = ssoConfig();
  if (!config) return failure(request, "unavailable");
  if (!hit(`sso-callback:${clientKey(request)}`, 30, 10 * 60_000).allowed) return failure(request, "rate_limited");
  const url = new URL(request.url);
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(SSO_STATE_COOKIE + "="))?.slice(SSO_STATE_COOKIE.length + 1);
  const result = await completeSso(config, "google", url.searchParams, cookie);
  if (!result.ok) return failure(request, result.reason);
  const token = await newSessionCookie(result.userId, result.tenantId);
  if (!token) return failure(request, "unavailable");
  const response = NextResponse.redirect(new URL(result.returnTo, config.origin), 303);
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_TTL_SECONDS });
  response.cookies.set(SSO_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
