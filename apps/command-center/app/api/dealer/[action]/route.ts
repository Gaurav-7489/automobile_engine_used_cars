import { NextResponse } from "next/server";
import { dealerCommerce, syncLicensedFeed, CommerceError } from "@vandlabs/data/commerce";
import { resolvePrincipal } from "../../../../lib/auth";
import { api, objectBody } from "../../../../lib/http";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ action: string }> }) {
  return api(async () => {
    const p = await resolvePrincipal(request), { action } = await context.params;
    if (action === "market") return NextResponse.json({ data: await (await dealerCommerce()).marketIntelligence(p, Object.fromEntries(new URL(request.url).searchParams)) });
    if (action !== "summary") throw new CommerceError(404, "Unknown dealer endpoint.");
    return NextResponse.json({ data: await (await dealerCommerce()).summary(p) });
  });
}
export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  return api(async () => {
    const p = await resolvePrincipal(request), b = await objectBody(request), { action } = await context.params, service = await dealerCommerce();
    let data: unknown;
    if (action === "recommendations") data = await service.dealerRecommendations(p, b);
    else if (action === "keys") data = await service.createKey(p, b);
    else if (action === "revoke-key" && typeof b.id === "string") data = await service.revokeKey(p, b.id);
    else if (action === "demo-plan") data = await service.previewPlan(p, b);
    else if (action === "import" && typeof b.sourceId === "string") data = await service.ingest(p, b.sourceId, b);
    else if (action === "sync" && typeof b.sourceId === "string") data = await syncLicensedFeed(p, b.sourceId);
    else throw new CommerceError(404, "Unknown dealer endpoint.");
    return NextResponse.json({ data }, { status: action === "keys" ? 201 : 200 });
  });
}
