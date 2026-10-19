import { NextResponse } from "next/server";

export function GET() {
  const headers = { "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" };
  const {APP_ORIGIN}=process.env, oidc=process.env.AUTH_MODE === "oidc";
  const COGNITO_DOMAIN=oidc && process.env.OIDC_ISSUER ? new URL(process.env.OIDC_ISSUER).origin : undefined;
  const COGNITO_DESKTOP_CLIENT_ID=oidc?process.env.OIDC_DESKTOP_CLIENT_ID:undefined;
  try {
    if (!["oidc"].includes(process.env.AUTH_MODE ?? "") || !["aurora", "neon"].includes(process.env.DATA_MODE ?? "") || !APP_ORIGIN || !COGNITO_DOMAIN || !COGNITO_DESKTOP_CLIENT_ID) throw new Error();
    for (const value of [APP_ORIGIN, COGNITO_DOMAIN]) {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.origin !== value.replace(/\/$/, "")) throw new Error();
    }
    return NextResponse.json({ apiOrigin: APP_ORIGIN.replace(/\/$/, ""), cognitoDomain: COGNITO_DOMAIN.replace(/\/$/, ""), clientId: COGNITO_DESKTOP_CLIENT_ID, ...(oidc ? {authorizeUrl:process.env.OIDC_AUTHORIZE_URL,tokenUrl:process.env.OIDC_TOKEN_URL,revokeUrl:process.env.OIDC_REVOKE_URL,audience:process.env.OIDC_AUDIENCE,resource:process.env.OIDC_RESOURCE} : {}) }, { headers });
  } catch {
    return NextResponse.json({ error: "Desktop access is not activated for this workspace. Contact your administrator." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
