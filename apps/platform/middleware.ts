import { NextResponse, type NextRequest } from "next/server";
import { requireCapability } from "@vandlabs/contracts";
import { accessError, createPrincipalResolver } from "@vandlabs/server-auth";

const resolvePrincipal = createPrincipalResolver({
  demoPrincipal: {
    userId: "demo-platform-admin", tenantId: "demo-platform",
    dealershipIds: [], locationIds: [], capabilities: ["platform:admin"],
  },
});

export async function middleware(request: NextRequest) {
  try {
    requireCapability(await resolvePrincipal(request), "platform:admin");
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    const failure = accessError(error);
    if (!failure) throw error;
    return NextResponse.json({ error: failure.message }, {
      status: failure.status, headers: { "Cache-Control": "private, no-store" },
    });
  }
}

export const config = {
  runtime: "nodejs",
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
