import { NextResponse, type NextRequest } from "next/server";
import { createNonce, isFrameablePath, pageCsp } from "./lib/csp";
import { SESSION_COOKIE, verifySession } from "./lib/session";

/** Pages that need a signed-in session. Authorisation is also enforced per page and per API. */
const PROTECTED = [/^\/app(\/|$)/, /^\/onboarding(\/|$)/, /^\/admin(\/|$)/, /^\/desktop(\/|$)/];

/**
 * Runs for every page. It (1) gives the response a Content Security Policy with a fresh nonce, which Next.js reads from the
 * request headers to tag its own scripts and the root layout puts on the theme script, and (2) sends unauthenticated or
 * expired sessions on protected pages to /login with a safe returnTo.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PROTECTED.some((re) => re.test(pathname))) {
    const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      const url = request.nextUrl.clone();
      const target = pathname + request.nextUrl.search;
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("returnTo", target);
      if (request.cookies.get(SESSION_COOKIE)?.value) url.searchParams.set("reason", "expired");
      return NextResponse.redirect(url);
    }
  }
  const nonce = createNonce();
  const csp = pageCsp(nonce, { frameable: isFrameablePath(pathname) });
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Every page; not API routes, build assets or files with an extension (icons, images, manifest, robots).
  matcher: [{ source: "/((?!api/|_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)" }],
};
