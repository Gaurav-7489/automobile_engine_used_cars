import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clientKey, hitShared } from "@/lib/rate-limit";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/session";
import { newSessionCookie } from "@/lib/server/auth";
import { appOrigin, exchangeGoogleCode, googleConfigured, OAUTH_COOKIE, oauthCookie, readGoogleIdToken, readOAuthState } from "@/lib/server/google-oauth";
import { signInVerifiedEmail } from "@/lib/server/identity";
import { isPlatformAdmin } from "@/lib/server/platform-admin";

export const dynamic = "force-dynamic";

const NOTICE = { no_account: "google_no_account", no_access: "google_no_account", disabled: "google_no_account", mfa: "google_mfa" } as const;

/** Google returns here with a one-time code. The code is exchanged server to server, and the verified email must belong to an existing member. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const origin = appOrigin(request);
  const url = new URL(request.url);
  const back = (notice: string) => {
    const response = NextResponse.redirect(`${origin}/login?notice=${notice}&provider=google`);
    response.cookies.set(oauthCookie("", 0));
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  if (provider !== "google" || !googleConfigured()) return back("sso_unavailable");
  if (!(await hitShared(`sso-callback:${clientKey(request)}`, 30, 10 * 60_000)).allowed) return back("sso_wait");
  const state = await readOAuthState(url.searchParams.get("state"), (await cookies()).get(OAUTH_COOKIE)?.value, "signin", "google");
  const code = url.searchParams.get("code");
  if (!state || !code || code.length > 2000) return back("google_failed");
  try {
    const tokens = await exchangeGoogleCode(code, `${origin}/api/auth/sso/google/callback`);
    const identity = readGoogleIdToken(tokens?.id_token, state.n);
    if (!identity) return back("google_failed");
    const result = await signInVerifiedEmail(identity.email);
    if (!result.ok) return back(NOTICE[result.code]);
    const token = await newSessionCookie(result.userId, result.tenantId);
    if (!token) return back("sso_unavailable");
    const landing = state.returnTo ?? ((await isPlatformAdmin(result.userId).catch(() => false)) ? "/admin" : "/app/overview");
    const response = NextResponse.redirect(`${origin}${landing}`);
    response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_TTL_SECONDS });
    response.cookies.set(oauthCookie("", 0));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error(JSON.stringify({ event: "google_signin_failure", message: error instanceof Error ? error.message : "unknown" }));
    return back("google_failed");
  }
}
