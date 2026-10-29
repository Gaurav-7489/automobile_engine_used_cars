import { readRoute } from "@/lib/server/read-api";
import { overviewData } from "@/lib/server/overview-model";

export const dynamic = "force-dynamic";

/** Everything the Command Centre shows, aggregated in the database for the member's branches: nothing is loaded wholesale and filtered in the browser. */
export async function GET(request: Request) {
  return readRoute(request, null, ({ c, principal, branchIds }) => overviewData(c, principal.tenantId, branchIds));
}
