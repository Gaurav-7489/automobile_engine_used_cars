import { NextResponse, type NextRequest } from "next/server";
import { accessError } from "@vandlabs/server-auth";
import { authorizeCommandPage } from "./lib/auth";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/command/login" || path.startsWith("/command/auth/")) return NextResponse.next();
  // Mutation handlers verify identity and resource scope themselves.
  if (request.nextUrl.pathname.startsWith("/command/api/")) return NextResponse.next();
  try {
    await authorizeCommandPage(request);
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    const failure = accessError(error);
    if (!failure) throw error;
    if (failure.status === 401 && request.headers.get("accept")?.includes("text/html")) {
      const next = request.cookies.has("__Host-vandlabs-refresh") ? "/command/auth/refresh" : "/command/login";
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
