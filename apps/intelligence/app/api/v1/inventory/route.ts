import { tenantTx } from "@/lib/server/db";
import { withApiKey } from "@/lib/server/public-api";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

/** Read-only stock list for the key's branches. Costs and margins are never exposed through the API. */
export async function GET(request: Request) {
  return withApiKey(request, "inventory:read", (caller) => tenantTx(caller.tenantId, async (c) => {
    const rows = (await c.query("SELECT stock_id, location_id, payload, availability_status, publish_status, updated_at FROM vehicles WHERE tenant_id=$1 AND location_id = ANY($2::uuid[]) ORDER BY updated_at DESC LIMIT 1000", [caller.tenantId, caller.locationIds])).rows as Row[];
    return rows.map((r) => {
      const p = r.payload as Row;
      return {
        stockId: r.stock_id, branchId: r.location_id, make: p.make, model: p.model, variant: p.variant, year: p.year, priceInr: p.price, odometerKm: p.mileage, fuel: p.fuelType, transmission: p.transmission, owners: p.ownership,
        availability: r.availability_status, published: r.publish_status === "published", photos: (Array.isArray(p.media) ? p.media : []).map((m) => (m as Row).url), updatedAt: new Date(String(r.updated_at)).toISOString(),
      };
    });
  }));
}
