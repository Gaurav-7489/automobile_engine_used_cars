import { NextResponse } from "next/server";
import { adAuthUrl, canManageAds, isConnectProvider, providerConfigured } from "@/lib/server/ad-accounts";
import { getPrincipal } from "@/lib/server/auth";
import { appOrigin, newOAuthState, oauthCookie } from "@/lib/server/google-oauth";

export const dynamic = "force-dynamic";

/** Starts connecting Google Ads and YouTube, Facebook and Instagram, or WhatsApp: the owner approves access on the provider's own screen. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const origin = appOrigin(request);
  const back = (notice: string) => NextResponse.redirect(`${origin}/app/advertising?ads=${notice}`);
  const current = await getPrincipal();
  if (!current) return NextResponse.redirect(`${origin}/login?returnTo=/app/advertising`);
  if (!isConnectProvider(provider)) return back("unknown");
  if (!canManageAds(current.principal)) return back("forbidden");
  if (!providerConfigured(provider)) return back("unavailable");
  const issued = await newOAuthState({ purpose: "ads", provider, sub: current.principal.userId, tid: current.principal.tenantId });
  if (!issued) return back("unavailable");
  const response = NextResponse.redirect(adAuthUrl(provider, `${origin}/api/advertising/accounts/${provider}/callback`, issued.state));
  response.cookies.set(oauthCookie(issued.nonce));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
