import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clientKey, hitShared } from "@/lib/rate-limit";
import { REAUTH_COOKIE, REAUTH_TTL_SECONDS, SESSION_COOKIE, SESSION_TTL_SECONDS, verifyPayload } from "@/lib/session";
import { getPrincipal, newReauthGrant, newSessionCookie } from "@/lib/server/auth";
import { appOrigin, flowCookieName, flowCookieValue, googleConfigured, oauthCookie, REAUTH_RESULT_COOKIE, type OAuthState } from "@/lib/server/google-oauth";
import { checkStepUp, readGoogleCallback, signInWithGoogle } from "@/lib/server/google-signin";
import type { StepUpResult } from "@/lib/step-up-copy";
import { ACCESS_COOKIE, ACCESS_TTL_SECONDS, newAccessCookie } from "@/lib/server/access-requests";

export const dynamic = "force-dynamic";

const NOTICE: Record<string, string> = {
  no_account: "google_no_account", no_access: "google_no_account", disabled: "google_disabled", conflict: "google_conflict",
  admin_not_approved: "google_no_account", link_not_approved: "google_link_not_approved",
};
const cookieOptions = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" } as const;

/** Google returns here with a one-time code (sign-in or step-up confirmation). The code is exchanged server to server with PKCE. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const origin = appOrigin(request);
  const url = new URL(request.url);
  const stateParam = url.searchParams.get("state");
  // Only this flow's cookie is cleared; a second flow started in the same browser keeps its own.
  const flowName = await flowCookieName(stateParam);
  const finish = (location: string) => {
    const response = NextResponse.redirect(location);
    if (flowName) response.cookies.set(oauthCookie(flowName, "", 0));
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  // A confirmation window records its outcome in a short-lived cookie too, so the page that opened it can show the reason.
  const confirmed = (result: StepUpResult) => {
    const response = finish(`${origin}/auth/confirmed?result=${result}`);
    response.cookies.set({ ...cookieOptions, name: REAUTH_RESULT_COOKIE, value: result, maxAge: result === "ok" ? 0 : 120 });
    return response;
  };
  const back = (notice: string) => finish(`${origin}/login?notice=${notice}&provider=google`);
  if (provider !== "google" || !googleConfigured()) return back("sso_unavailable");
  if (!(await hitShared(`sso-callback:${clientKey(request)}`, 30, 10 * 60_000)).allowed) return back("sso_wait");
  const store = await cookies();
  const purpose = (await verifyPayload<OAuthState>(stateParam))?.purpose === "reauth" ? "reauth" : "signin";
  try {
    const read = await readGoogleCallback({ state: stateParam, code: url.searchParams.get("code"), cookie: await flowCookieValue(stateParam, (name) => store.get(name)?.value), redirectUri: `${origin}/api/auth/sso/google/callback`, purpose });

    if (purpose === "reauth") {
      const current = await getPrincipal();
      if (!current) return confirmed("signed_out");
      if (!read) return confirmed("failed");
      const check = await checkStepUp(read.state, read.identity, { userId: current.principal.userId, sessionIssuedAt: current.session.iat ?? 0 });
      if (!check.ok) return confirmed(check.reason === "auth_time_missing" ? "setup_required" : "failed");
      const grant = await newReauthGrant(current.principal.userId, current.session.iat ?? 0);
      if (!grant) return confirmed("unavailable");
      const response = confirmed("ok");
      response.cookies.set(REAUTH_COOKIE, grant, { ...cookieOptions, maxAge: REAUTH_TTL_SECONDS });
      return response;
    }

    if (!read) return back("google_failed");
    const result = await signInWithGoogle(read.identity);
    if (!result.ok) {
      console.warn(JSON.stringify({ event: "google_signin_refused", code: result.code }));
      // A Google account with no access at all may ask for it. The request is bound to this verified identity (signed, 30 minutes).
      if (result.code === "no_account") {
        const pass = await newAccessCookie(read.identity);
        if (pass) {
          const response = finish(`${origin}/request-access`);
          response.cookies.set(ACCESS_COOKIE, pass, { ...cookieOptions, maxAge: ACCESS_TTL_SECONDS });
          return response;
        }
      }
      return back(NOTICE[result.code] ?? "google_no_account");
    }
    const token = await newSessionCookie(result.userId, result.tenantId, "google");
    if (!token) return back("sso_unavailable");
    const landing = read.state.returnTo ?? (result.platformAdmin ? "/admin" : "/app/overview");
    const response = finish(`${origin}${landing}`);
    response.cookies.set(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_SECONDS });
    // A new sign-in never inherits a step-up confirmation from someone else's session in this browser.
    response.cookies.set(REAUTH_COOKIE, "", { ...cookieOptions, maxAge: 0 });
    return response;
  } catch (error) {
    console.error(JSON.stringify({ event: "google_signin_failure", message: error instanceof Error ? error.message : "unknown" }));
    return purpose === "reauth" ? confirmed("failed") : back("google_failed");
  }
}
