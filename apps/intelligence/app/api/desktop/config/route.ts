import { NextResponse } from "next/server";
import { sessionSecret } from "@/lib/session";

export const dynamic = "force-dynamic";

/** What the desktop application needs to start sign-in. Public by design and contains no secret: only this deployment's own addresses. */
export function GET(request: Request) {
  const origin = (process.env.APP_ORIGIN ?? new URL(request.url).origin).replace(/\/$/, "");
  if (!sessionSecret() || (process.env.NODE_ENV === "production" && !origin.startsWith("https://"))) {
    return NextResponse.json({ error: "Desktop access is not activated for this workspace. Contact your administrator." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ protocol: "vandlabs-desktop-v1", apiOrigin: origin, authorizeUrl: `${origin}/desktop/authorize`, tokenUrl: `${origin}/api/desktop/token` }, { headers: { "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
