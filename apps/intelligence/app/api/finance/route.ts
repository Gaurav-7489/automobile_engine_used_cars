import { json, problem } from "@/lib/api";
import { can } from "@/lib/permissions";
import { getPrincipal } from "@/lib/server/auth";
import { readFinance } from "@/lib/server/finance-records";

export const dynamic = "force-dynamic";

/** Revenue from car sales next to operating expenses, per month, for the member's permitted branches. */
export async function GET(request: Request) {
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Your session has expired. Sign in again.");
  if (!can(current.principal.role, "capital.view")) return problem(403, "forbidden", "Your role cannot view finances.");
  const url = new URL(request.url);
  const branches = (url.searchParams.get("branches") ?? "").split(",").filter(Boolean);
  try {
    return json(await readFinance(current.principal, { from: url.searchParams.get("from") ?? "", to: url.searchParams.get("to") ?? "", branches }));
  } catch (error) {
    console.error(JSON.stringify({ event: "finance_read_failure", message: error instanceof Error ? error.message : "unknown" }));
    return problem(500, "failed", "We could not load finances. Try again.");
  }
}
