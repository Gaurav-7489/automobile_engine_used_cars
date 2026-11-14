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
const cap = (s: string) => (!s ? s : s.length <= 3 ? s.toUpperCase() : s[0].toUpperCase() + s.slice(1).toLowerCase());

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

export type PublicCard = { stockId: string; year: number; make: string; model: string; variant: string; fuel: string; transmission: string; km: number; price: number | null; photo: string | null; city: string; availability: "available" | "reserved" };
export type PublicInventory = { dealer: string; cars: PublicCard[]; total: number; page: number; pages: number; makes: string[]; cities: string[] };

const SORTS = {
  newest: "v.updated_at DESC",
  "price-asc": "(v.payload->>'price')::numeric ASC NULLS LAST",
  "price-desc": "(v.payload->>'price')::numeric DESC NULLS LAST",
  "km-asc": "(v.payload->>'mileage')::numeric ASC NULLS LAST",
  "year-desc": "(v.payload->>'year')::int DESC NULLS LAST",
} as const;
export type PublicSort = keyof typeof SORTS;
export const PUBLIC_SORTS: { value: PublicSort; label: string }[] = [
  { value: "newest", label: "Newest listed" }, { value: "price-asc", label: "Price: low to high" }, { value: "price-desc", label: "Price: high to low" },
  { value: "km-asc", label: "Kilometres: lowest" }, { value: "year-desc", label: "Year: newest" },
];
export const PUBLIC_PAGE_SIZE = 24;
const LIVE_STOCK = "v.publish_status = 'published' AND v.availability_status IN ('available', 'reserved')";
const FROM = "FROM vehicles v JOIN locations l ON l.id = v.location_id AND l.tenant_id = v.tenant_id";

/** Every published, unsold car of one dealership, with the same public-fields-only rule as a single listing. */
export async function readPublicInventory(tenantId: string, f: { q?: string; make?: string; model?: string; variant?: string; fuel?: string; city?: string; sort?: string; page?: number }): Promise<PublicInventory | null> {
  if (!UUID.test(tenantId)) return null;
  const tenant = tenantId.toLowerCase();
  return tenantTx(tenant, async (c) => {
    const org = (await c.query("SELECT name FROM organizations WHERE tenant_id = $1 ORDER BY created_at LIMIT 1", [tenant])).rows[0] as Row | undefined;
    if (!org) return null;
    const meta = (await c.query("SELECT payload FROM intelligence_documents WHERE tenant_id = $1 AND collection = 'meta' AND id = 'workspace'", [tenant])).rows[0] as Row | undefined;
    const dealer = String((((meta?.payload as Row | undefined)?.profile ?? {}) as Row).displayName ?? org.name ?? "").trim();
    const where = ["v.tenant_id = $1", LIVE_STOCK];
    const values: unknown[] = [tenant];
    const add = (sql: string, value: unknown) => { values.push(value); where.push(sql.replace("?", `$${values.length}`)); };
    const q = (f.q ?? "").trim().slice(0, 60);
    if (q) add("(coalesce(v.payload->>'make', '') || ' ' || coalesce(v.payload->>'model', '') || ' ' || coalesce(v.payload->>'variant', '')) ILIKE ?", `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
    if (f.make) add("lower(v.payload->>'make') = lower(?)", f.make.slice(0, 40));
    if (f.model) add("lower(v.payload->>'model') = lower(?)", f.model.slice(0, 40));
    if (f.variant) add("lower(v.payload->>'variant') = lower(?)", f.variant.slice(0, 40));
    if (f.fuel) add("lower(v.payload->>'fuelType') = lower(?)", f.fuel.slice(0, 20));
    if (f.city) add("lower(l.city) = lower(?)", f.city.slice(0, 60));
    const filter = where.join(" AND ");
    const total = Number((await c.query(`SELECT count(*)::int AS n ${FROM} WHERE ${filter}`, values)).rows[0]?.n ?? 0);
    const pages = Math.max(1, Math.ceil(total / PUBLIC_PAGE_SIZE));
    const page = Math.min(pages, Math.max(1, Math.floor(Number.isFinite(f.page) ? Number(f.page) : 1)));
    const order = Object.hasOwn(SORTS, f.sort ?? "") ? SORTS[f.sort as PublicSort] : SORTS.newest;
    const rows = (await c.query(`SELECT v.stock_id, v.payload, v.availability_status, l.city ${FROM} WHERE ${filter} ORDER BY ${order}, v.stock_id LIMIT ${PUBLIC_PAGE_SIZE} OFFSET ${(page - 1) * PUBLIC_PAGE_SIZE}`, values)).rows as Row[];
    const facets = (await c.query(`SELECT array_agg(DISTINCT v.payload->>'make') AS makes, array_agg(DISTINCT l.city) AS cities ${FROM} WHERE v.tenant_id = $1 AND ${LIVE_STOCK}`, [tenant])).rows[0] as Row | undefined;
    const cars: PublicCard[] = rows.map((r) => {
      const p = r.payload as Row;
      const photo = (Array.isArray(p.media) ? p.media : []).map((m) => String((m as Row).url ?? "")).find((u) => /^https:\/\//.test(u)) ?? null;
      const price = Number(p.price ?? 0);
      return { stockId: String(r.stock_id), year: Number(p.year ?? 0), make: String(p.make ?? ""), model: String(p.model ?? ""), variant: String(p.variant ?? ""), fuel: cap(String(p.fuelType ?? "")), transmission: cap(String(p.transmission ?? "")), km: Number(p.mileage ?? 0), price: price > 0 ? price : null, photo, city: String(r.city ?? ""), availability: String(r.availability_status) === "reserved" ? "reserved" : "available" };
    });
    const list = (v: unknown) => (Array.isArray(v) ? [...new Set((v as unknown[]).filter((x): x is string => typeof x === "string" && x.length > 0))].sort((a, b) => a.localeCompare(b)) : []);
    return { dealer, cars, total, page, pages, makes: list(facets?.makes), cities: list(facets?.cities) };
  });
}
