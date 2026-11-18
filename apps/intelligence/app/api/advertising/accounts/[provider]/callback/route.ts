import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { completeConnection, isConnectProvider } from "@/lib/server/ad-accounts";
import { completeWhatsApp } from "@/lib/server/connections";
import { getPrincipal } from "@/lib/server/auth";
import { appOrigin, flowCookieName, flowCookieValue, oauthCookie, readOAuthState } from "@/lib/server/google-oauth";

export const dynamic = "force-dynamic";

/** The provider returns here. The connection is saved for the same person and dealership that started it, or not at all. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const origin = appOrigin(request);
  const url = new URL(request.url);
  const back = (query: Record<string, string>, flowName?: string) => {
    const response = NextResponse.redirect(`${origin}/app/advertising?${new URLSearchParams(query)}`);
    if (flowName) response.cookies.set(oauthCookie(flowName, "", 0));
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  if (!isConnectProvider(provider)) return back({ ads: "unknown" });
  const current = await getPrincipal();
  const store = await cookies();
  const stateParam = url.searchParams.get("state");
  const flowName = (await flowCookieName(stateParam)) ?? undefined;
  const state = await readOAuthState(stateParam, await flowCookieValue(stateParam, (name) => store.get(name)?.value), "ads", provider);
  const code = url.searchParams.get("code");
  if (!current || !state || state.sub !== current.principal.userId || state.tid !== current.principal.tenantId) return back({ ads: "failed" }, flowName);
  if (!code || code.length > 2000) return back({ ads: url.searchParams.get("error") ? "cancelled" : "failed" }, flowName);
  try {
    const redirectUri = `${origin}/api/advertising/accounts/${provider}/callback`;
    const result = provider === "whatsapp" ? await completeWhatsApp(current.principal, code, redirectUri) : await completeConnection(current.principal, provider, code, redirectUri);
    return result.ok ? back({ ads: "connected", provider }, flowName) : back({ ads: "failed", reason: result.message.slice(0, 200) }, flowName);
  } catch (error) {
    console.error(JSON.stringify({ event: "ad_connect_failure", provider, message: error instanceof Error ? error.message : "unknown" }));
    return back({ ads: "failed" }, flowName);
  }
}
