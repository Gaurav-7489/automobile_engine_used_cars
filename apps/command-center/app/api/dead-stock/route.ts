import { NextResponse } from "next/server";
import { staffDeadStock } from "@vandlabs/data/dead-stock";
import { resolvePrincipal } from "../../../lib/auth";
import { api } from "../../../lib/http";

// Tenant-scoped, read-only dead-stock review limited to the evidence the caller's role may see.
// Recommendations are review prompts only.
export async function GET(request: Request) {
  return api(async () => {
    const report = await staffDeadStock(await resolvePrincipal(request));
    return NextResponse.json({ data: report }, { headers: { "Cache-Control": "private, no-store" } });
  });
}
