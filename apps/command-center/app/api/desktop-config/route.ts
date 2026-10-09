import { NextResponse } from "next/server";

export function GET() {
  const headers = { "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" };
  const { APP_ORIGIN, COGNITO_DOMAIN, COGNITO_DESKTOP_CLIENT_ID } = process.env;
  try {
    if (process.env.AUTH_MODE !== "cognito" || process.env.DATA_MODE !== "aurora" || !APP_ORIGIN || !COGNITO_DOMAIN || !COGNITO_DESKTOP_CLIENT_ID) throw new Error();
    for (const value of [APP_ORIGIN, COGNITO_DOMAIN]) {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.origin !== value.replace(/\/$/, "")) throw new Error();
    }
    return NextResponse.json({ apiOrigin: APP_ORIGIN.replace(/\/$/, ""), cognitoDomain: COGNITO_DOMAIN.replace(/\/$/, ""), clientId: COGNITO_DESKTOP_CLIENT_ID }, { headers });
  } catch {
    return NextResponse.json({ error: "Desktop access is not activated for this workspace. Contact your administrator." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
