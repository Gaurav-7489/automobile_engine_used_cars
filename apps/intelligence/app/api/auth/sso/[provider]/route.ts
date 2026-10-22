import { NextResponse } from "next/server";
import { configuredProviders } from "@/lib/auth-users";

export const dynamic = "force-dynamic";

/**
 * SSO start. Providers are only offered when configured; in this environment the identity-provider handshake (state + PKCE) is not wired,
 * so the user is returned to sign-in with an honest message instead of a fake redirect.
 */
export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  const known = configuredProviders().some((p) => p.id === provider);
  const url = new URL("/login", request.url);
  url.searchParams.set("notice", known ? "sso_unavailable" : "sso_unknown");
  url.searchParams.set("provider", provider === "google" || provider === "microsoft" ? provider : "provider");
  return NextResponse.redirect(url, 303);
}
