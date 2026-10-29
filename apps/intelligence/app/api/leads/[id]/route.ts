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
    // Other leads from the same contact number, and the lead this one duplicates, so the drawer can show them without loading every lead.
    const hide = (l: Lead): Lead => (can(role, "leads.contact") ? l : { ...l, contactFull: l.contactMasked, email: undefined });
    const digits = row.data.contactFull.replace(/\D/g, "");
    const linked = digits ? (await c.query("SELECT data FROM intelligence_lead_index WHERE tenant_id = $1 AND lead_id <> $2 AND branch_id = ANY($3::uuid[]) AND contact_digits = $4 LIMIT 20", [principal.tenantId, id, principal.locationIds, digits])).rows.map((r) => hide(r.data as Lead)) : [];
    const duplicate = row.data.duplicateOf ? ((await c.query("SELECT data FROM intelligence_lead_index WHERE tenant_id = $1 AND lead_id = $2 AND branch_id = ANY($3::uuid[])", [principal.tenantId, row.data.duplicateOf, principal.locationIds])).rows[0] as { data: Lead } | undefined)?.data : undefined;
    return { lead, vehicle, linked, duplicate: duplicate ? hide(duplicate) : null };
  }, "leads").then(async (response) => {
    const body = (await response.clone().json().catch(() => null)) as { missing?: boolean } | null;
    return body?.missing ? problem(404, "not_found", "Not found.") : response;
  });
}
