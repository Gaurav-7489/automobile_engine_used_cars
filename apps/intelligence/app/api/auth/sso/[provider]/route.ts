import { NextResponse } from "next/server";
import { clientKey, hitShared } from "@/lib/rate-limit";
import { safeReturnTo } from "@/lib/session";
import { appOrigin, googleAuthUrl, googleConfigured, newOAuthState, oauthCookie } from "@/lib/server/google-oauth";

export const dynamic = "force-dynamic";

/** Starts "Sign in with Google": sends the browser to Google's own sign-in page. No password ever passes through this app. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const origin = appOrigin(request);
  const back = (notice: string) => NextResponse.redirect(`${origin}/login?notice=${notice}&provider=${encodeURIComponent(provider.slice(0, 20))}`);
  if (provider !== "google") return back("sso_unknown");
  if (!googleConfigured()) return back("sso_unavailable");
  if (!(await hitShared(`sso-start:${clientKey(request)}`, 30, 10 * 60_000)).allowed) return back("sso_wait");
  const returnTo = new URL(request.url).searchParams.get("returnTo");
  const issued = await newOAuthState({ purpose: "signin", provider: "google", returnTo: returnTo ? safeReturnTo(returnTo) : undefined });
  if (!issued) return back("sso_unavailable");
  const response = NextResponse.redirect(googleAuthUrl({ redirectUri: `${origin}/api/auth/sso/google/callback`, state: issued.state, nonce: issued.nonce, scope: "openid email profile" }));
  response.cookies.set(oauthCookie(issued.nonce));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
