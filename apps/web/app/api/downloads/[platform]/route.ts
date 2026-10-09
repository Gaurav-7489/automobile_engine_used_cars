import { NextResponse } from "next/server";
import { getDesktopRelease } from "../../../../lib/desktop-release";

export async function GET(_request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const headers = { "Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff" };
  if (platform !== "windows" && platform !== "mac") return NextResponse.json({ error: "Unsupported platform." }, { status: 404, headers });
  const release = await getDesktopRelease();
  const asset = release?.assets[platform];
  if (!asset) return NextResponse.json({ error: "Installer release is not available yet. Please try again later." }, { status: 503, headers: { ...headers, "Retry-After": "300", "Cache-Control": "no-store" } });
  return NextResponse.redirect(asset.url, { status: 307, headers });
}
