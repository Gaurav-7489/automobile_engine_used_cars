import { choice, intParam, readRoute } from "@/lib/server/read-api";
import { listSales } from "@/lib/server/read-queries";

export const dynamic = "force-dynamic";

/** Sales for the member's branches, newest first, in a closing-month window. Used to link a lead to a reconciled sale and by the finance pages. */
export async function GET(request: Request) {
  return readRoute(request, ["leads.view", "capital.view", "reports.view"], async ({ c, principal, branchIds, url }) => {
    const p = url.searchParams;
    const month = /^\d{4}-\d{2}$/;
    return listSales(c, principal.tenantId, branchIds, month.test(p.get("from") ?? "") ? p.get("from")! : "0000-00", month.test(p.get("to") ?? "") ? p.get("to")! : "9999-99",
      intParam(url, "page", 1, 1, 100_000), intParam(url, "size", 25, 1, 200), choice(p.get("state"), ["", "Completed", "Void", "Unreconciled"] as const, "") || undefined);
  });
}
