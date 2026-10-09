import { NextResponse, type NextRequest } from "next/server";
import { authorizePlatform } from "./lib/auth";
import { accessError } from "@vandlabs/server-auth";

export async function middleware(request: NextRequest) {
  // NextURL strips the configured basePath before middleware sees pathname.
  const pathname = request.nextUrl.pathname;
  const path = pathname === "/platform" || pathname.startsWith("/platform/")
    ? pathname : "/platform" + (pathname === "/" ? "" : pathname);
  if (path === "/platform/login" || path.startsWith("/platform/auth/")) return NextResponse.next();
  try {
    await authorizePlatform(request);
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    const failure = accessError(error);
    if (!failure) throw error;
    if (failure.status === 401 && request.headers.get("accept")?.includes("text/html")) {
      const next = request.cookies.has("__Host-vandlabs-refresh") ? "/platform/auth/refresh" : "/platform/login";
      const target = new URL(next, request.url);target.searchParams.set("returnTo",path+request.nextUrl.search);
      return NextResponse.redirect(target);
    }
    return NextResponse.json({ error: failure.message }, {
      status: failure.status, headers: { "Cache-Control": "private, no-store" },
    });
  }
}

export const config = {
  runtime: "nodejs",
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
