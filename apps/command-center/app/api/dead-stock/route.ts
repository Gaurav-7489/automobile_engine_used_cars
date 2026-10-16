import { NextResponse } from "next/server";
import { requireCapability } from "@vandlabs/contracts";
import { staffSnapshot } from "@vandlabs/data";
import { deadStockReport } from "@vandlabs/data/dead-stock";
import { resolvePrincipal } from "../../../lib/auth";
import { api } from "../../../lib/http";

// Tenant-scoped, read-only dead-stock review. Recommendations are review prompts only.
export async function GET(request: Request) {
  return api(async () => {
    const principal = await resolvePrincipal(request);
    for (const capability of ["inventory:read", "analytics:read"] as const) requireCapability(principal, capability);
    const report = deadStockReport(await staffSnapshot(principal));
    return NextResponse.json({ data: report }, { headers: { "Cache-Control": "private, no-store" } });
  });
}
