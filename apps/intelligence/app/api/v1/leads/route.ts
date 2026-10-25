import { tenantTx } from "@/lib/server/db";
import { withApiKey } from "@/lib/server/public-api";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

/** Read-only leads for the key's branches, newest first. Contact details are included because this scope exists to sync them into a CRM. */
export async function GET(request: Request) {
  return withApiKey(request, "leads:read", (caller) => tenantTx(caller.tenantId, async (c) => {
    const rows = (await c.query(`SELECT l.id, l.location_id, l.payload, l.stage, l.source, l.created_at, l.updated_at, v.stock_id FROM leads l LEFT JOIN vehicles v ON v.tenant_id = l.tenant_id AND v.id = l.vehicle_id
      WHERE l.tenant_id=$1 AND l.location_id = ANY($2::uuid[]) ORDER BY l.created_at DESC LIMIT 1000`, [caller.tenantId, caller.locationIds])).rows as Row[];
    return rows.map((r) => {
      const p = r.payload as Row;
      return { id: r.id, branchId: r.location_id, name: p.name, phone: p.phone, email: p.email, stage: r.stage, source: r.source, vehicleStockId: r.stock_id ?? null, createdAt: new Date(String(r.created_at)).toISOString(), updatedAt: new Date(String(r.updated_at)).toISOString() };
    });
  }));
}
