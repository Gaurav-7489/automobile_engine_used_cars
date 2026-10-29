import { readRoute } from "@/lib/server/read-api";
import { listVehicles } from "@/lib/server/read-queries";
import type { Vehicle } from "@/lib/domain";

export const dynamic = "force-dynamic";

/** The stock the advertising studio needs: vehicles that campaigns already refer to, and a bounded list of available stock to start new ones. */
export async function GET(request: Request) {
  return readRoute(request, "campaign.view", async ({ c, principal, branchIds }) => {
    const refs = (await c.query("SELECT DISTINCT payload->>'vehicleId' AS id FROM intelligence_documents WHERE tenant_id = $1 AND collection = 'campaigns'", [principal.tenantId])).rows.map((r) => String(r.id));
    const campaignVehicles = refs.length ? (await c.query("SELECT data FROM intelligence_vehicle_index WHERE tenant_id = $1 AND stock_id = ANY($2::text[]) AND branch_id = ANY($3::uuid[])", [principal.tenantId, refs, branchIds])).rows.map((r) => r.data as Vehicle) : [];
    const available = await listVehicles(c, principal.tenantId, branchIds, { tab: "available", sort: "age", dir: "desc", page: 1, size: 200 });
    return { campaignVehicles, available: available.vehicles, availableTotal: available.total };
  });
}
