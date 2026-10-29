import { readRoute } from "@/lib/server/read-api";
import { listVehicles } from "@/lib/server/read-queries";
import type { Vehicle } from "@/lib/domain";

export const dynamic = "force-dynamic";

/** The stock the pricing queue works on: vehicles flagged for review, vehicles that already have a request, and a bounded list for manual review. */
export async function GET(request: Request) {
  return readRoute(request, "price.view", async ({ c, principal, branchIds }) => {
    const flagged = await listVehicles(c, principal.tenantId, branchIds, { tab: "available", flag: "review", sort: "age", dir: "desc", page: 1, size: 200 });
    const options = await listVehicles(c, principal.tenantId, branchIds, { tab: "available", sort: "age", dir: "desc", page: 1, size: 200 });
    const requested = (await c.query("SELECT DISTINCT payload->>'vehicleId' AS id FROM intelligence_documents WHERE tenant_id = $1 AND collection = 'priceRequests'", [principal.tenantId])).rows.map((r) => String(r.id));
    const requestVehicles = requested.length ? (await c.query("SELECT data FROM intelligence_vehicle_index WHERE tenant_id = $1 AND stock_id = ANY($2::text[]) AND branch_id = ANY($3::uuid[])", [principal.tenantId, requested, branchIds])).rows.map((r) => r.data as Vehicle) : [];
    return { flagged: flagged.vehicles, flaggedTotal: flagged.total, options: options.vehicles, optionsTotal: options.total, requestVehicles };
  });
}
