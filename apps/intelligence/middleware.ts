import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "./lib/session";

/** Authenticated routes: unauthenticated or expired sessions return to /login with a safe returnTo. Authorisation is also enforced per page and per API. */
export async function middleware(request: NextRequest) {
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();
  const url = request.nextUrl.clone();
  const target = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("returnTo", target);
  if (request.cookies.get(SESSION_COOKIE)?.value) url.searchParams.set("reason", "expired");
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/app/:path*", "/onboarding/:path*", "/onboarding", "/admin/:path*", "/admin"] };
