import { choice, readRoute } from "@/lib/server/read-api";
import { reportsData } from "@/lib/server/finance-model";

export const dynamic = "force-dynamic";
const MONTH = /^\d{4}-\d{2}$/;

export async function GET(request: Request) {
  return readRoute(request, "reports.view", async ({ c, principal, branchIds, url }) => {
    const p = url.searchParams;
    return reportsData(c, principal.tenantId, branchIds, MONTH.test(p.get("from") ?? "") ? p.get("from")! : "0000-00", MONTH.test(p.get("to") ?? "") ? p.get("to")! : "9999-99", choice(p.get("compare"), ["previous", "yoy", "none"] as const, "previous"));
  }, "reports");
}
