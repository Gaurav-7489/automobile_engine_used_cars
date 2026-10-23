import { NextResponse } from "next/server";
import { json, problem, readJson } from "@/lib/api";
import { clientKey, hit } from "@/lib/rate-limit";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/session";
import { newSessionCookie } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/csrf";
import { redeemToken, tokenInfo } from "@/lib/server/identity";

export const dynamic = "force-dynamic";

/** Reveals only which address a link is for. */
export async function GET(request: Request) {
  const limit = hit(`token-info:${clientKey(request)}`, 30, 10 * 60_000);
  if (!limit.allowed) return problem(429, "rate_limited", "Too many requests. Try again shortly.");
  const info = await tokenInfo(new URL(request.url).searchParams.get("token") ?? "");
  return info ? json({ kind: info.kind, email: info.email, name: info.name }) : problem(404, "invalid_link", "This link is not valid or has expired. Ask your administrator for a new one.");
}

/** Completes an invitation or password reset: the person chooses their own password and is signed in. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const limit = hit(`redeem:${clientKey(request)}`, 10, 10 * 60_000);
  if (!limit.allowed) return problem(429, "rate_limited", "Too many attempts. Try again in a few minutes.");
  const body = await readJson<{ token?: string; password?: string }>(request);
  if (typeof body?.token !== "string" || typeof body.password !== "string") return problem(422, "invalid", "Choose a password.");
  const result = await redeemToken(body.token, body.password);
  if (!result.ok) return problem(422, "invalid", result.message);
  const token = await newSessionCookie(result.userId, result.tenantId);
  if (!token) return problem(503, "not_configured", "Sign-in is not configured for this environment.");
  const response = NextResponse.json({ ok: true, outcome: result.outcome }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_TTL_SECONDS });
  return response;
}
