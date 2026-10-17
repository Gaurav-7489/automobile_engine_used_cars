import { NextResponse } from "next/server";
import { tenantConfig } from "@vandlabs/data";
import { discoveryLimits } from "@vandlabs/data/discovery";
import { discoveryPage, editorialMedia, turnsFrom } from "../../../../lib/discovery";
import { discoverySummary } from "../../../../lib/discovery-ai";
import { limitPublicRequest } from "../../../../lib/public-request";

/** GET so identical searches are served from the CDN instead of paying for inference again. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const turns = turnsFrom(url.searchParams.getAll("q"));
  if (!turns.length || url.searchParams.getAll("q").length > discoveryLimits.turns) return NextResponse.json({ source: "rules" }, { headers: { "Cache-Control": "no-store" } });
  if (process.env.DISCOVERY_AI_ENABLED !== "true") return NextResponse.json({ source: "disabled" }, { headers: { "Cache-Control": "public, max-age=300" } });
  const limited = await limitPublicRequest(request, tenantConfig.tenantId + ":discover-ai", 20); if (limited) return limited;
  try {
    const summary = await discoverySummary(await discoveryPage(turns), editorialMedia());
    return NextResponse.json(summary, { headers: { "Cache-Control": summary.source === "ai" ? "public, max-age=0, s-maxage=300" : "no-store" } });
  } catch {
    return NextResponse.json({ source: "unavailable" }, { headers: { "Cache-Control": "no-store" } });
  }
}
