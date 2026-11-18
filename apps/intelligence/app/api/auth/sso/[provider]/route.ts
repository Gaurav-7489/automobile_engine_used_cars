import { NextResponse } from "next/server";
import { clientKey, hitShared } from "@/lib/rate-limit";
import { safeReturnTo } from "@/lib/session";
import { getPrincipal } from "@/lib/server/auth";
import { appOrigin, googleAuthUrl, googleConfigured, newOAuthState, oauthCookie, oauthCookieName } from "@/lib/server/google-oauth";
import { STEP_UP_MAX_AGE_SECONDS } from "@/lib/server/google-signin";
import { isStepUpAction, isStepUpResource } from "@/lib/step-up-actions";

export const dynamic = "force-dynamic";

/**
 * Starts "Continue with Google": sends the browser to Google's own sign-in page. No password ever passes through this app.
 * `?intent=reauth&action=…&resource=…` is step-up confirmation for a signed-in user before one sensitive change (opened in a small window).
 * Google is asked to sign the person in again (prompt=login), and the result is checked against the account bound to this session.
 */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const origin = appOrigin(request);
  const url = new URL(request.url);
  const back = (notice: string) => NextResponse.redirect(`${origin}/login?notice=${notice}&provider=${encodeURIComponent(provider.slice(0, 20))}`);
  if (provider !== "google") return back("sso_unknown");
  if (!googleConfigured()) return back("sso_unavailable");
  if (!(await hitShared(`sso-start:${clientKey(request)}`, 30, 10 * 60_000)).allowed) return back("sso_wait");
  const redirectUri = `${origin}/api/auth/sso/google/callback`;

  if (url.searchParams.get("intent") === "reauth") {
    const current = await getPrincipal();
    if (!current) return NextResponse.redirect(`${origin}/auth/confirmed?result=signed_out`);
    // One action and one resource per confirmation. Both go into the signed state, so the callback cannot be pointed at another operation.
    const action = url.searchParams.get("action");
    const resource = url.searchParams.get("resource") ?? "";
    if (!isStepUpAction(action) || !isStepUpResource(resource)) return NextResponse.redirect(`${origin}/auth/confirmed?result=failed`);
    const issued = await newOAuthState({ purpose: "reauth", provider: "google", sub: current.principal.userId, sid: current.session.iat ?? 0, act: action, res: resource });
    if (!issued) return NextResponse.redirect(`${origin}/auth/confirmed?result=unavailable`);
    const response = NextResponse.redirect(googleAuthUrl({ redirectUri, state: issued.state, nonce: issued.nonce, verifier: issued.verifier, scope: "openid email", maxAge: STEP_UP_MAX_AGE_SECONDS, loginHint: current.principal.email, reauthenticate: true }));
    response.cookies.set(oauthCookie(oauthCookieName(issued.nonce), issued.cookie));
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const returnTo = url.searchParams.get("returnTo");
  const issued = await newOAuthState({ purpose: "signin", provider: "google", returnTo: returnTo ? safeReturnTo(returnTo) : undefined });
  if (!issued) return back("sso_unavailable");
  const response = NextResponse.redirect(googleAuthUrl({ redirectUri, state: issued.state, nonce: issued.nonce, verifier: issued.verifier, scope: "openid email profile" }));
  response.cookies.set(oauthCookie(oauthCookieName(issued.nonce), issued.cookie));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
