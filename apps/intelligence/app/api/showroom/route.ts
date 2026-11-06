import { readRoute } from "@/lib/server/read-api";
import type { Vehicle } from "@/lib/domain";

export const dynamic = "force-dynamic";

/** The dealership's showroom at a glance: what is live, what is not yet live and why, and enquiries the showroom produced. */
export async function GET(request: Request) {
  return readRoute(request, "inventory.view", async ({ c, principal, branchIds }) => {
    const t = principal.tenantId;
    const counts = (await c.query(
      `SELECT count(*) FILTER (WHERE v.publish_status = 'published' AND v.availability_status IN ('available','reserved'))::int AS live,
              count(*) FILTER (WHERE v.publish_status <> 'published' AND v.publish_status <> 'archived' AND v.availability_status = 'available')::int AS not_live
         FROM vehicles v WHERE v.tenant_id = $1 AND v.location_id = ANY($2::uuid[])`, [t, branchIds])).rows[0] ?? { live: 0, not_live: 0 };
    const pending = (await c.query(
      `SELECT i.data FROM vehicles v JOIN intelligence_vehicle_index i ON i.tenant_id = v.tenant_id AND i.stock_id = v.stock_id
        WHERE v.tenant_id = $1 AND v.location_id = ANY($2::uuid[]) AND v.publish_status <> 'published' AND v.publish_status <> 'archived' AND v.availability_status = 'available'
        ORDER BY v.updated_at DESC LIMIT 50`, [t, branchIds])).rows.map((r) => r.data as Vehicle);
    const enquiries = (await c.query(
      `SELECT count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS d30, count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS d7
         FROM intelligence_lead_index WHERE tenant_id = $1 AND source = 'Website' AND branch_id = ANY($2::uuid[])`, [t, branchIds])).rows[0] ?? { d30: 0, d7: 0 };
    return { tenantId: t, live: Number(counts.live), notLive: Number(counts.not_live), pending, enquiries30d: Number(enquiries.d30), enquiries7d: Number(enquiries.d7) };
  }, "inventory");
}
