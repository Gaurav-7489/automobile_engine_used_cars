import { NextResponse } from "next/server";
import { dealerCommerce, CommerceError } from "@vandlabs/data/commerce";
import type { ApiScope } from "@vandlabs/contracts";
import { api, objectBody } from "../../../../lib/http";
export const runtime = "nodejs";
function token(request: Request) {
  const match = /^Bearer (vand_[^\s]+)$/.exec(request.headers.get("authorization") ?? "");
  if (!match) throw new CommerceError(401, "Send your API key using Authorization: Bearer <key>.");
  return match[1];
}
export async function GET(request: Request, context: { params: Promise<{ resource: string }> }) {
  return api(async () => {
    const credential = token(request), { resource } = await context.params;
    const scope: ApiScope | null = resource === "vehicles" ? "vehicles:read" : resource === "fuel-prices" ? "fuel:read" : null;
    if (!scope) throw new CommerceError(404, "Unknown API resource.");
    return NextResponse.json(await (await dealerCommerce()).business(credential, scope, Object.fromEntries(new URL(request.url).searchParams)));
  });
}
export async function POST(request: Request, context: { params: Promise<{ resource: string }> }) {
  return api(async () => {
    const credential = token(request), { resource } = await context.params;
    if (!["recommendations", "ingest"].includes(resource)) throw new CommerceError(404, "Unknown API resource.");
    return NextResponse.json(await (await dealerCommerce()).business(credential, resource === "ingest" ? "sourcing:write" : "recommendations:read", await objectBody(request)));
  });
}
