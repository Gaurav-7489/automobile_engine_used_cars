import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { completeConnection, isAdProvider } from "@/lib/server/ad-accounts";
import { getPrincipal } from "@/lib/server/auth";
import { appOrigin, OAUTH_COOKIE, oauthCookie, readOAuthState } from "@/lib/server/google-oauth";

export const dynamic = "force-dynamic";

/** The provider returns here. The connection is saved for the same person and dealership that started it, or not at all. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const origin = appOrigin(request);
  const url = new URL(request.url);
  const back = (query: Record<string, string>) => {
    const response = NextResponse.redirect(`${origin}/app/advertising?${new URLSearchParams(query)}`);
    response.cookies.set(oauthCookie("", 0));
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  if (!isAdProvider(provider)) return back({ ads: "unknown" });
  const current = await getPrincipal();
  const state = await readOAuthState(url.searchParams.get("state"), (await cookies()).get(OAUTH_COOKIE)?.value, "ads", provider);
  const code = url.searchParams.get("code");
  if (!current || !state || state.sub !== current.principal.userId || state.tid !== current.principal.tenantId) return back({ ads: "failed" });
  if (!code || code.length > 2000) return back({ ads: url.searchParams.get("error") ? "cancelled" : "failed" });
  try {
    const result = await completeConnection(current.principal, provider, code, `${origin}/api/advertising/accounts/${provider}/callback`);
    return result.ok ? back({ ads: "connected", provider }) : back({ ads: "failed", reason: result.message.slice(0, 200) });
  } catch (error) {
    console.error(JSON.stringify({ event: "ad_connect_failure", provider, message: error instanceof Error ? error.message : "unknown" }));
    return back({ ads: "failed" });
  }
}
