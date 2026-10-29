import { can } from "@/lib/permissions";
import { choice, intParam, readRoute } from "@/lib/server/read-api";
import { stockReport, type StockAction } from "@/lib/server/stock-model";

export const dynamic = "force-dynamic";

/** Ageing bands, capital locked and review prompts. Capital and enquiry evidence follow the caller's role; withheld evidence is reported as unavailable. */
export async function GET(request: Request) {
  return readRoute(request, "inventory.view", async ({ c, principal, role, branchIds, url }) => {
    const bandParam = url.searchParams.get("band");
    const band = bandParam !== null && /^[0-3]$/.test(bandParam) ? Number(bandParam) : undefined;
    const action = choice(url.searchParams.get("action"), ["", "inspect", "follow_up", "review_price"] as const, "") as StockAction | "";
    return stockReport(c, principal.tenantId, branchIds, { capital: can(role, "capital.view"), enquiries: can(role, "leads.view"), band, action: action || undefined, page: intParam(url, "page", 1, 1, 10_000), size: intParam(url, "size", 25, 1, 100) });
  }, "stock_intelligence");
}
