import { can } from "@/lib/permissions";
import { scopedAlerts } from "@/lib/server/overview-model";
import { readRoute } from "@/lib/server/read-api";
import type { Alert, Lead, Vehicle } from "@/lib/domain";

export const dynamic = "force-dynamic";

const like = (q: string) => `%${q.toLowerCase().replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

/** The command palette's lookup: a handful of matches per kind, limited by the caller's role and branches. */
export async function GET(request: Request) {
  return readRoute(request, null, async ({ c, principal, role, branchIds, url }) => {
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
    if (q.length < 2) return { vehicles: [], leads: [], alerts: [] };
    const vehicles = can(role, "inventory.view") ? (await c.query("SELECT data FROM intelligence_vehicle_index WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[]) AND search LIKE $3 ORDER BY stock_id COLLATE \"C\" LIMIT 5", [principal.tenantId, branchIds, like(q)])).rows.map((r) => r.data as Vehicle) : [];
    const leads = can(role, "leads.view") ? (await c.query("SELECT data FROM intelligence_lead_index WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[]) AND search LIKE $3 ORDER BY lead_id COLLATE \"C\" LIMIT 5", [principal.tenantId, branchIds, like(q)])).rows.map((r) => r.data as Lead) : [];
    const needle = q.toLowerCase();
    const alerts: Alert[] = can(role, "alerts.view") ? (await scopedAlerts(c, principal.tenantId, branchIds)).filter((a) => a.status !== "Resolved" && `${a.id} ${a.title} ${a.recordRef}`.toLowerCase().includes(needle)).slice(0, 4) : [];
    return { vehicles, leads, alerts };
  });
}
