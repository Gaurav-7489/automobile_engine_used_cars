import { plain } from "./db";

type Row = Record<string, unknown>;

/**
 * The public VandLabs marketplace: every car that a dealership on VandLabs has published on its own public pages, in one place.
 * Each card links to the dealer's car page (/l/{tenant}/{stock}), where the buyer calls, messages or sends an enquiry that reaches
 * the dealer as a lead. Rows come from intelligence_marketplace_live(), which returns public fields only and skips dealerships
 * that have left the marketplace.
 */

export type MarketCar = {
  tenantId: string; stockId: string; dealer: string; year: number | null; make: string; model: string; variant: string;
  fuel: string; transmission: string; km: number; price: number | null; photo: string | null; city: string; state: string; availability: "available" | "reserved";
};
export type Marketplace = { cars: MarketCar[]; total: number; page: number; pages: number; makes: string[]; cities: string[]; fuels: string[]; dealers: number };
export type MarketFilters = { q?: string; make?: string; fuel?: string; city?: string; sort?: string; page?: number; maxPrice?: number };

export const MARKET_PAGE_SIZE = 24;
const SORTS = {
  newest: "listed_at DESC",
  "price-asc": "price ASC NULLS LAST",
  "price-desc": "price DESC NULLS LAST",
  "km-asc": "km ASC",
  "year-desc": "year DESC NULLS LAST",
} as const;
export const MARKET_SORTS: { value: keyof typeof SORTS; label: string }[] = [
  { value: "newest", label: "Newest listed" }, { value: "price-asc", label: "Price: low to high" }, { value: "price-desc", label: "Price: high to low" },
  { value: "km-asc", label: "Kilometres: lowest" }, { value: "year-desc", label: "Year: newest" },
];
const cap = (s: string) => (!s ? s : s.length <= 3 ? s.toUpperCase() : s[0].toUpperCase() + s.slice(1).toLowerCase());
const like = (s: string) => `%${s.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

export async function readMarketplace(f: MarketFilters): Promise<Marketplace> {
  return plain(async (c) => {
    const where: string[] = [];
    const values: unknown[] = [];
    const add = (sql: string, value: unknown) => { values.push(value); where.push(sql.replaceAll("?", `$${values.length}`)); };
    const q = (f.q ?? "").trim().slice(0, 60);
    if (q) add("concat_ws(' ', make, model, variant, dealer, city) ILIKE ?", like(q));
    if (f.make) add("lower(make) = lower(?)", f.make.slice(0, 40));
    if (f.fuel) add("lower(fuel) = lower(?)", f.fuel.slice(0, 20));
    if (f.city) add("lower(city) = lower(?)", f.city.slice(0, 60));
    if (f.maxPrice && Number.isFinite(f.maxPrice) && f.maxPrice > 0) add("price <= ?", Math.round(f.maxPrice));
    const filter = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = Number((await c.query(`SELECT count(*)::int AS n FROM intelligence_marketplace_live() ${filter}`, values)).rows[0]?.n ?? 0);
    const pages = Math.max(1, Math.ceil(total / MARKET_PAGE_SIZE));
    const page = Math.min(pages, Math.max(1, Math.floor(Number.isFinite(f.page) ? Number(f.page) : 1)));
    const order = Object.hasOwn(SORTS, f.sort ?? "") ? SORTS[f.sort as keyof typeof SORTS] : SORTS.newest;
    const rows = (await c.query(`SELECT * FROM intelligence_marketplace_live() ${filter} ORDER BY ${order}, tenant_id, stock_id LIMIT ${MARKET_PAGE_SIZE} OFFSET ${(page - 1) * MARKET_PAGE_SIZE}`, values)).rows as Row[];
    const facets = (await c.query(`SELECT array_agg(DISTINCT make) AS makes, array_agg(DISTINCT city) AS cities, array_agg(DISTINCT lower(fuel)) AS fuels, count(DISTINCT tenant_id)::int AS dealers FROM intelligence_marketplace_live()`)).rows[0] as Row | undefined;
    const list = (v: unknown) => (Array.isArray(v) ? [...new Set((v as unknown[]).filter((x): x is string => typeof x === "string" && x.length > 0))].sort((a, b) => a.localeCompare(b)) : []);
    return {
      cars: rows.map((r) => ({
        tenantId: String(r.tenant_id), stockId: String(r.stock_id), dealer: String(r.dealer ?? ""), year: r.year === null ? null : Number(r.year),
        make: String(r.make ?? ""), model: String(r.model ?? ""), variant: String(r.variant ?? ""), fuel: cap(String(r.fuel ?? "")), transmission: cap(String(r.transmission ?? "")),
        km: Number(r.km ?? 0), price: r.price === null || r.price === undefined ? null : Number(r.price), photo: r.photo ? String(r.photo) : null,
        city: String(r.city ?? ""), state: String(r.state ?? ""), availability: String(r.availability) === "reserved" ? "reserved" : "available",
      })),
      total, page, pages,
      makes: list(facets?.makes), cities: list(facets?.cities), fuels: list(facets?.fuels).map(cap), dealers: Number(facets?.dealers ?? 0),
    };
  });
}
