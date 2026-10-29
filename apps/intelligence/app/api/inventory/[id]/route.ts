import { problem } from "@/lib/api";
import { can } from "@/lib/permissions";
import { enquiryContext } from "@/lib/server/read-queries";
import { readRoute } from "@/lib/server/read-api";
import type { Lead, Sale, Vehicle } from "@/lib/domain";

export const dynamic = "force-dynamic";

/** One stock record with the leads and sale that refer to it. A vehicle outside the member's branches is reported exactly like a missing one. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return readRoute(request, "inventory.view", async ({ c, principal, role }) => {
    const row = (await c.query("SELECT data FROM intelligence_vehicle_index WHERE tenant_id = $1 AND stock_id = $2 AND branch_id = ANY($3::uuid[])", [principal.tenantId, id, principal.locationIds])).rows[0] as { data: Vehicle } | undefined;
    if (!row) return { missing: true };
    const ctx = await enquiryContext(c, principal.tenantId);
    const leads = (await c.query("SELECT data FROM intelligence_lead_index WHERE tenant_id = $1 AND vehicle_stock_id = $2 AND branch_id = ANY($3::uuid[]) ORDER BY created_at DESC LIMIT 50", [principal.tenantId, id, principal.locationIds])).rows as { data: Lead }[];
    const sale = (await c.query("SELECT data FROM intelligence_sale_index WHERE tenant_id = $1 AND vehicle_stock_id = $2 AND branch_id = ANY($3::uuid[]) LIMIT 1", [principal.tenantId, id, principal.locationIds])).rows[0] as { data: Sale } | undefined;
    const mask = can(role, "leads.contact");
    return {
      vehicle: { ...row.data, enquiries14d: ctx.byStock.get(id) ?? 0, cohortMedianEnquiries: ctx.median },
      leads: leads.map((l) => (mask ? l.data : { ...l.data, contactFull: l.data.contactMasked, email: undefined })),
      sale: sale?.data ?? null,
    };
  }, "inventory").then(async (response) => {
    const body = (await response.clone().json().catch(() => null)) as { missing?: boolean } | null;
    return body?.missing ? problem(404, "not_found", "Not found.") : response;
  });
}
