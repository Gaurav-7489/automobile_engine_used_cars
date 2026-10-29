import { choice, readRoute } from "@/lib/server/read-api";
import { reportDrill } from "@/lib/server/finance-model";
import { getMonths } from "@/lib/time";

export const dynamic = "force-dynamic";
const MONTH = /^\d{4}-\d{2}$/;

/** The records behind one report figure for the chosen period, so the number and its list always reconcile. */
export async function GET(request: Request) {
  return readRoute(request, "reports.view", async ({ c, principal, branchIds, url }) => {
    const p = url.searchParams;
    const from = MONTH.test(p.get("from") ?? "") ? p.get("from")! : "0000-00";
    const to = MONTH.test(p.get("to") ?? "") ? p.get("to")! : "9999-99";
    return reportDrill(c, principal.tenantId, branchIds, getMonths().filter((m) => m >= from && m <= to), choice(p.get("kind"), ["acquired", "sold", "profit", "qualified"] as const, "acquired"));
  });
}
