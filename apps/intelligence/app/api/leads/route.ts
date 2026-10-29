import { can } from "@/lib/permissions";
import { choice, intParam, readRoute } from "@/lib/server/read-api";
import { listLeads, stageCounts } from "@/lib/server/read-queries";
import { LEAD_STAGES } from "@/lib/domain";
import type { Lead, Vehicle } from "@/lib/domain";

export const dynamic = "force-dynamic";

const hideContact = (l: Lead): Lead => ({ ...l, contactFull: l.contactMasked, email: undefined });

/** One page of leads, filtered in the database, plus the per-stage counts the tabs and pipeline need. */
export async function GET(request: Request) {
  return readRoute(request, "leads.view", async ({ c, principal, role, branchIds, url }) => {
    const p = url.searchParams;
    const stage = choice(p.get("stage"), ["all", ...LEAD_STAGES] as const, "all");
    const page = await listLeads(c, principal.tenantId, branchIds, {
      stage, owner: p.get("owner") || undefined, source: p.get("source") || undefined, vehicle: p.get("vehicle") || undefined, createdDays: choice(p.get("created"), ["7", "30", "90", "all"] as const, "30"),
      overdue: p.get("overdue") === "1", mineName: p.get("mine") === "1" ? principal.name : undefined, q: (p.get("q") ?? "").slice(0, 80), order: p.get("order") === "recent" ? "recent" : undefined, page: intParam(url, "page", 1, 1, 100_000), size: intParam(url, "size", 25, 1, 200),
    });
    const contact = can(role, "leads.contact");
    // The stock each listed lead refers to, so rows can show the vehicle without the browser holding the whole inventory.
    const stockIds = [...new Set(page.leads.map((l) => l.vehicleId).filter(Boolean) as string[])];
    const vehicles = stockIds.length ? (await c.query("SELECT data FROM intelligence_vehicle_index WHERE tenant_id = $1 AND stock_id = ANY($2::text[]) AND branch_id = ANY($3::uuid[])", [principal.tenantId, stockIds, branchIds])).rows.map((r) => r.data as Vehicle) : [];
    return { ...page, leads: contact ? page.leads : page.leads.map(hideContact), vehicles, stages: await stageCounts(c, principal.tenantId, branchIds) };
  }, "leads");
}
