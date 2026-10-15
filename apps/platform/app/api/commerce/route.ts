import { NextResponse } from "next/server";
import { dealerCommerce, CommerceError } from "@vandlabs/data/commerce";
import { authorizePlatform } from "../../../lib/auth";
import { api, objectBody } from "@vandlabs/data/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return api(async () => {
    const p = await authorizePlatform(request), b = await objectBody(request), service = await dealerCommerce();
    if (typeof b.tenantId !== "string") throw new CommerceError(400, "Tenant is required.");
    if (b.action === "subscription") return NextResponse.json({ data: await service.provision(p, b.tenantId, b.subscription) });
    if (b.action === "source") return NextResponse.json({ data: await service.approveSource(p, b.tenantId, b.source) });
    throw new CommerceError(400, "Unknown commercial action.");
  });
}
