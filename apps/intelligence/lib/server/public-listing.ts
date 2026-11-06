import { tenantTx } from "./db";

type Row = Record<string, unknown>;

export type PublicListing = {
  stockId: string;
  year: number;
  make: string;
  model: string;
  variant: string;
  fuel: string;
  transmission: string;
  km: number;
  owners: number;
  bodyType: string;
  colour: string;
  /** Asking price in rupees, or null when the dealer has not set one. */
  price: number | null;
  availability: "available" | "reserved";
  photos: string[];
  dealer: string;
  branch: { name: string; city: string; state: string; phone: string };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STOCK = /^[A-Za-z0-9-]{1,40}$/;
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * A vehicle as the public sees it: only stock the dealer has published to their website and has not sold or archived, and only
 * the fields a public listing shows. Never registration, costs, leads or internal notes.
 */
export async function readPublicListing(tenantId: string, stockId: string): Promise<PublicListing | null> {
  if (!UUID.test(tenantId) || !STOCK.test(stockId)) return null;
  return tenantTx(tenantId.toLowerCase(), async (c) => {
    const row = (await c.query(
      `SELECT v.stock_id, v.payload, v.availability_status, l.name AS branch_name, l.city, l.state, l.phone
         FROM vehicles v JOIN locations l ON l.id = v.location_id AND l.tenant_id = v.tenant_id
        WHERE v.tenant_id = $1 AND upper(v.stock_id) = upper($2) AND v.publish_status = 'published' AND v.availability_status IN ('available', 'reserved')
        LIMIT 1`,
      [tenantId.toLowerCase(), stockId],
    )).rows[0] as Row | undefined;
    if (!row) return null;
    const meta = (await c.query("SELECT payload FROM intelligence_documents WHERE tenant_id = $1 AND collection = 'meta' AND id = 'workspace'", [tenantId.toLowerCase()])).rows[0] as Row | undefined;
    const org = (await c.query("SELECT name FROM organizations WHERE tenant_id = $1 ORDER BY created_at LIMIT 1", [tenantId.toLowerCase()])).rows[0] as Row | undefined;
    const profile = ((meta?.payload as Row | undefined)?.profile ?? {}) as Row;
    const p = row.payload as Row;
    const price = Number(p.price ?? 0);
    const photos = (Array.isArray(p.media) ? p.media : []).map((m) => String((m as Row).url ?? "")).filter((u) => /^https:\/\//.test(u)).slice(0, 20);
    return {
      stockId: String(row.stock_id),
      year: Number(p.year ?? 0), make: String(p.make ?? ""), model: String(p.model ?? ""), variant: String(p.variant ?? ""),
      fuel: cap(String(p.fuelType ?? "")), transmission: cap(String(p.transmission ?? "")), km: Number(p.mileage ?? 0), owners: Number(p.ownership ?? 1),
      bodyType: String(p.bodyType ?? ""), colour: String(p.exteriorColor ?? ""),
      price: price > 0 ? price : null,
      availability: String(row.availability_status) === "reserved" ? "reserved" : "available",
      photos,
      dealer: String(profile.displayName ?? org?.name ?? "").trim(),
      branch: { name: String(row.branch_name ?? ""), city: String(row.city ?? ""), state: String(row.state ?? ""), phone: String(row.phone ?? "") },
    };
  });
}
