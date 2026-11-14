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
        ...presentation(p),
      };
    });
  }));
}

const text = (v: unknown) => (typeof v === "string" && v.trim() && v !== "Not recorded" ? v.trim().slice(0, 2000) : undefined);
const SPEC_KEYS = ["engine", "power", "torque", "acceleration", "topSpeed", "drivetrain", "seats", "range", "battery"];

/**
 * What a public listing page shows beyond the basics: body style, colours, description, features and headline figures.
 * Only fields that are recorded are sent. The registration number is never among them; only its state code is.
 */
function presentation(p: Row): Row {
  const spec = (p.specifications && typeof p.specifications === "object" ? p.specifications : {}) as Row;
  const specs = Object.fromEntries(SPEC_KEYS.map((k) => [k, text(spec[k])]).filter(([, v]) => v));
  const list = (v: unknown) => (Array.isArray(v) ? v.map(text).filter(Boolean).slice(0, 20) : []);
  const out: Row = {
    bodyType: text(p.bodyType), exteriorColor: text(p.exteriorColor), interiorColor: text(p.interiorColor), description: text(p.description),
    features: list(p.features), categories: list(p.categories), registrationState: text(spec.registrationState), featured: p.featured === true ? true : undefined,
    specifications: Object.keys(specs).length ? specs : undefined,
  };
  for (const k of Object.keys(out)) if (out[k] === undefined || (Array.isArray(out[k]) && !(out[k] as unknown[]).length)) delete out[k];
  return out;
}
