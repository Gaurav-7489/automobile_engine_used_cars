import { intParam, readRoute } from "@/lib/server/read-api";
import { todayIst } from "@/lib/server/read-queries";

export const dynamic = "force-dynamic";

/** How many available vehicles a price-review threshold would put in scope, counted in the database. */
export async function GET(request: Request) {
  return readRoute(request, "alerts.view", async ({ c, principal, branchIds, url }) => {
    const days = intParam(url, "days", 30, 1, 3650);
    const n = (await c.query("SELECT count(*)::int AS n FROM intelligence_vehicle_index WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[]) AND status = 'available' AND GREATEST(0, COALESCE(sold_day, $3::date) - acquired_day) > $4", [principal.tenantId, branchIds, todayIst(), days])).rows[0]?.n;
    return { affected: Number(n ?? 0) };
  });
}
