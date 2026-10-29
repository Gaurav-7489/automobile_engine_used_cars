import { problem } from "@/lib/api";
import { can } from "@/lib/permissions";
import { readRoute } from "@/lib/server/read-api";
import type { Lead, Vehicle } from "@/lib/domain";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return readRoute(request, "leads.view", async ({ c, principal, role }) => {
    const row = (await c.query("SELECT data FROM intelligence_lead_index WHERE tenant_id = $1 AND lead_id = $2 AND branch_id = ANY($3::uuid[])", [principal.tenantId, id, principal.locationIds])).rows[0] as { data: Lead } | undefined;
    if (!row) return { missing: true };
    const lead = can(role, "leads.contact") ? row.data : { ...row.data, contactFull: row.data.contactMasked, email: undefined };
    const vehicle = lead.vehicleId ? ((await c.query("SELECT data FROM intelligence_vehicle_index WHERE tenant_id = $1 AND stock_id = $2 AND branch_id = ANY($3::uuid[])", [principal.tenantId, lead.vehicleId, principal.locationIds])).rows[0] as { data: Vehicle } | undefined)?.data ?? null : null;
    return { lead, vehicle };
  }).then(async (response) => {
    const body = (await response.clone().json().catch(() => null)) as { missing?: boolean } | null;
    return body?.missing ? problem(404, "not_found", "Not found.") : response;
  });
}
