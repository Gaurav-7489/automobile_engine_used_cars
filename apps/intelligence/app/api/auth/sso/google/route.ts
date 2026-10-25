import { NextResponse } from "next/server";
import { withBase } from "@/lib/base-path";
import { clientKey, hit } from "@/lib/rate-limit";
import { safeReturnTo } from "@/lib/session";
import { SSO_STATE_COOKIE, beginSso, ssoConfig } from "@/lib/server/federated";

export const dynamic = "force-dynamic";

const back = (request: Request, error: string) => NextResponse.redirect(new URL(withBase(`/login?sso_error=${error}`), request.url), 303);

/** Starts Google sign-in through the shared Cognito pool. `invite` carries a one-time invitation token to accept with Google. */
export async function GET(request: Request) {
  const config = ssoConfig();
  if (!config) return back(request, "unavailable");
  if (!hit(`sso-start:${clientKey(request)}`, 30, 10 * 60_000).allowed) return back(request, "rate_limited");
  const params = new URL(request.url).searchParams;
  const invite = params.get("invite") ?? undefined;
  const flow = await beginSso(config, "google", safeReturnTo(params.get("returnTo")), invite && invite.length <= 200 ? invite : undefined);
  if (!flow) return back(request, "unavailable");
  const response = NextResponse.redirect(flow.url, 303);
  response.cookies.set(SSO_STATE_COOKIE, flow.cookie, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: flow.maxAge });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
