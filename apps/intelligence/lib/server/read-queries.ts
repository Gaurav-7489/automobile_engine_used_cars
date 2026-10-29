import type { Lead, LeadStage, Lifecycle, Sale, Vehicle } from "../domain";
import type { SqlClient } from "./db";

/**
 * Page-shaped reads over the read model. Every query is tenant-scoped twice (explicit predicate plus row-level
 * security) and branch-scoped by the caller's permitted branches. Nothing here reads whole collections into memory.
 */

export const todayIst = (now = new Date()): string => new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);

/** Whole calendar days in India time, matching lib/finance.stockAgeDays. */
const AGE = "GREATEST(0, COALESCE(v.sold_day, $TODAY::date) - v.acquired_day)";
const BUCKET = `CASE WHEN ${AGE} <= 15 THEN '0-15' WHEN ${AGE} <= 30 THEN '16-30' WHEN ${AGE} <= 45 THEN '31-45' ELSE '>45' END`;

/** Sales with the fields that follow the vehicle (ledger sales) resolved at read time. */
const SALES_EFFECTIVE = `
  SELECT s.sale_id, s.vehicle_stock_id, s.closed_at, s.price_paise, s.direct_paise, s.data,
         CASE WHEN s.from_ledger THEN COALESCE(v.branch_id, s.branch_id) ELSE s.branch_id END AS branch_id,
         CASE WHEN s.from_ledger THEN COALESCE(v.landed_paise, 0) ELSE s.landed_paise END AS landed_paise,
         CASE WHEN s.from_ledger THEN (CASE WHEN COALESCE(v.cost_complete, false) THEN 'Completed' ELSE 'Unreconciled' END) ELSE s.state END AS state,
         v.acquired_day
  FROM intelligence_sale_index s
  LEFT JOIN intelligence_vehicle_index v ON v.tenant_id = s.tenant_id AND v.stock_id = s.vehicle_stock_id
  WHERE s.tenant_id = $1`;

const q = async (c: SqlClient, sql: string, values: unknown[]) => (await c.query(sql.replace(/\$TODAY/g, `$${values.length}`), values)).rows as Record<string, unknown>[];

export type VehicleFilter = { tab: "all" | Lifecycle; q?: string; make?: string; age?: string; vbranch?: string; flag?: "cost" | "media" | "review" | ""; sort?: "year" | "km" | "landed" | "asking" | "age" | ""; dir?: "asc" | "desc"; page: number; size: number };

const SORT_SQL: Record<string, string> = { year: "v.year", km: "v.km", landed: "v.landed_paise", asking: "COALESCE(v.asking_paise, -1)", age: AGE };

/**
 * Enquiries in the last 14 days per vehicle, and the cohort median over available stock (upper median, as the full
 * workspace read computes it). Only vehicles that actually have enquiries are fetched; the zeros are implied.
 */
export async function enquiryContext(c: SqlClient, tenantId: string): Promise<{ byStock: Map<string, number>; median: number }> {
  const rows = (await c.query(
    `SELECT vh.stock_id AS sid, count(*)::int AS c, (vi.status = 'available') AS avail
     FROM leads l JOIN vehicles vh ON vh.tenant_id = l.tenant_id AND vh.id = l.vehicle_id
     LEFT JOIN intelligence_vehicle_index vi ON vi.tenant_id = l.tenant_id AND vi.stock_id = vh.stock_id
     WHERE l.tenant_id = $1 AND l.created_at >= now() - interval '14 days' GROUP BY vh.stock_id, vi.status`, [tenantId])).rows as { sid: string; c: number; avail: boolean }[];
  const available = Number((await c.query("SELECT count(*)::int AS n FROM intelligence_vehicle_index WHERE tenant_id = $1 AND status = 'available'", [tenantId])).rows[0]?.n ?? 0);
  const positives = rows.filter((r) => r.avail).map((r) => Number(r.c)).sort((a, b) => a - b);
  const zeros = available - positives.length;
  const rank = Math.floor(available / 2); // zero-based position in the sorted counts
  const median = available === 0 ? 0 : rank < zeros ? 0 : positives[rank - zeros];
  return { byStock: new Map(rows.map((r) => [String(r.sid), Number(r.c)])), median };
}

export type VehiclePage = { vehicles: Vehicle[]; total: number; page: number; size: number; counts: Record<string, number>; makes: string[] };

export async function listVehicles(c: SqlClient, tenantId: string, branchIds: string[], f: VehicleFilter, today = todayIst()): Promise<VehiclePage> {
  const values: unknown[] = [tenantId, branchIds];
  const add = (v: unknown) => { values.push(v); return `$${values.length}`; };
  const where = ["v.tenant_id = $1", "v.branch_id = ANY($2::uuid[])"];
  const ctx = await enquiryContext(c, tenantId);
  if (f.tab === "all") where.push("v.status NOT IN ('sold', 'archived')"); else where.push(`v.status = ${add(f.tab)}`);
  if (f.q) where.push(`v.search LIKE ${add(`%${f.q.toLowerCase().replace(/[%_\\]/g, (m) => `\\${m}`)}%`)}`);
  if (f.make) where.push(`v.make = ${add(f.make)}`);
  if (f.vbranch) where.push(`v.branch_id = ${add(f.vbranch)}::uuid`);
  const todayP = add(today);
  where.push(`${todayP}::date IS NOT NULL`);
  if (f.age) where.push(f.age === ">45" ? `${AGE.replace(/\$TODAY/g, todayP)} > 45` : `(${BUCKET.replace(/\$TODAY/g, todayP)}) = ${add(f.age)}`);
  if (f.flag === "cost") where.push("NOT v.cost_complete");
  if (f.flag === "media") where.push("NOT v.has_images");
  if (f.flag === "review") {
    // Price review: available, priced, older than 30 days, with fewer enquiries than the cohort median.
    const atOrAbove = [...ctx.byStock].filter(([, n]) => n >= ctx.median).map(([sid]) => sid);
    where.push(`v.status = 'available' AND v.asking_paise IS NOT NULL AND ${AGE.replace(/\$TODAY/g, todayP)} > 30 AND ${ctx.median > 0 ? `NOT (v.stock_id = ANY(${add(atOrAbove)}::text[]))` : "false"}`);
  }
  const sortExpr = f.sort ? SORT_SQL[f.sort].replace(/\$TODAY/g, todayP) : null;
  const order = sortExpr ? `${sortExpr} ${f.dir === "desc" ? "DESC" : "ASC"}, v.stock_id COLLATE "C" ASC` : `v.stock_id COLLATE "C" ASC`;
  const size = Math.min(Math.max(1, f.size), 200);
  const sql = `SELECT v.data, count(*) OVER () AS total FROM intelligence_vehicle_index v WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ${add(size)} OFFSET ${add((Math.max(1, f.page) - 1) * size)}`;
  const rows = (await c.query(sql, values)).rows as { data: Vehicle; total: string }[];
  const vehicles = rows.map((r) => ({ ...r.data, enquiries14d: ctx.byStock.get(r.data.id) ?? 0, cohortMedianEnquiries: ctx.median }));
  const meta = (await c.query(
    `SELECT count(*) FILTER (WHERE status NOT IN ('sold','archived'))::int AS "all", count(*) FILTER (WHERE status = 'available')::int AS available, count(*) FILTER (WHERE status = 'reserved')::int AS reserved,
            count(*) FILTER (WHERE status = 'preparation')::int AS preparation, count(*) FILTER (WHERE status = 'sold')::int AS sold, count(*) FILTER (WHERE status = 'archived')::int AS archived,
            COALESCE(array_agg(DISTINCT make ORDER BY make) , '{}') AS makes
     FROM intelligence_vehicle_index WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[])`, [tenantId, branchIds])).rows[0] as Record<string, unknown>;
  const total = rows.length ? Number(rows[0].total) : 0;
  if (!rows.length && f.page > 1) {
    // A page beyond the end: find the true total on page one, then return the last page.
    const first = await listVehicles(c, tenantId, branchIds, { ...f, page: 1 }, today);
    return first.total > size ? listVehicles(c, tenantId, branchIds, { ...f, page: Math.ceil(first.total / size) }, today) : first;
  }
  return {
    vehicles, total, page: f.page, size,
    counts: { all: Number(meta.all), available: Number(meta.available), reserved: Number(meta.reserved), preparation: Number(meta.preparation), sold: Number(meta.sold), archived: Number(meta.archived) },
    makes: (meta.makes as string[]) ?? [],
  };
}

export type StockMetricsRow = {
  unsold: number; available: number; reserved: number; preparation: number; landedCapital: number; ageing: number; estimatedGross: number; grossExcluded: number;
  availableByAge: Record<string, number>; capitalByAge: Record<string, number>;
};

/** SQL equivalent of lib/finance.stockMetrics over the permitted branches. */
export async function stockMetricsSql(c: SqlClient, tenantId: string, branchIds: string[], today = todayIst()): Promise<StockMetricsRow> {
  const rows = await q(c,
    `SELECT ${BUCKET} AS bucket, v.status, count(*)::int AS n, COALESCE(sum(v.landed_paise), 0)::bigint AS landed,
            COALESCE(sum(CASE WHEN v.status = 'available' AND v.cost_complete AND v.asking_paise IS NOT NULL THEN v.asking_paise - v.landed_paise END), 0)::bigint AS gross,
            count(*) FILTER (WHERE v.status = 'available' AND NOT (v.cost_complete AND v.asking_paise IS NOT NULL))::int AS excluded
     FROM intelligence_vehicle_index v WHERE v.tenant_id = $1 AND v.branch_id = ANY($2::uuid[]) AND v.status NOT IN ('sold', 'archived') GROUP BY 1, 2`, [tenantId, branchIds, today]);
  const empty = () => ({ "0-15": 0, "16-30": 0, "31-45": 0, ">45": 0 }) as Record<string, number>;
  const m: StockMetricsRow = { unsold: 0, available: 0, reserved: 0, preparation: 0, landedCapital: 0, ageing: 0, estimatedGross: 0, grossExcluded: 0, availableByAge: empty(), capitalByAge: empty() };
  for (const r of rows) {
    const n = Number(r.n); const landed = Number(r.landed); const bucket = String(r.bucket);
    m.unsold += n; m.landedCapital += landed; m.capitalByAge[bucket] += landed;
    if (r.status === "reserved") m.reserved += n;
    if (r.status === "preparation") m.preparation += n;
    if (r.status === "available") { m.available += n; m.availableByAge[bucket] += n; if (bucket === ">45") m.ageing += n; m.estimatedGross += Number(r.gross); m.grossExcluded += Number(r.excluded); }
  }
  return m;
}

/** Acquisitions and completed sales per month (India time) for the permitted branches. */
export async function movementSql(c: SqlClient, tenantId: string, branchIds: string[], months: readonly string[]) {
  const acquired = await q(c, "SELECT to_char(acquired_day, 'YYYY-MM') AS m, count(*)::int AS n FROM intelligence_vehicle_index WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[]) GROUP BY 1", [tenantId, branchIds]);
  const sold = await q(c, `SELECT to_char(closed_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS m, count(*)::int AS n FROM (${SALES_EFFECTIVE}) s WHERE s.state = 'Completed' AND s.branch_id = ANY($2::uuid[]) GROUP BY 1`, [tenantId, branchIds]);
  const a = new Map(acquired.map((r) => [String(r.m), Number(r.n)])); const s = new Map(sold.map((r) => [String(r.m), Number(r.n)]));
  return months.map((month) => ({ month, acquired: a.get(month) ?? 0, sold: s.get(month) ?? 0 }));
}

export type SaleRow = Sale;

const toSale = (r: Record<string, unknown>): Sale => ({ ...(r.data as Sale), branchId: String(r.branch_id), landed: Number(r.landed_paise), state: r.state as Sale["state"] });

/** Realized profit, counts and median days-to-sale within a closing-month window. */
export async function salesSummarySql(c: SqlClient, tenantId: string, branchIds: string[], fromMonth: string, toMonth: string) {
  const rows = await q(c,
    `SELECT to_char(closed_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS m, state,
            count(*)::int AS n, COALESCE(sum(price_paise - landed_paise - direct_paise), 0)::bigint AS profit,
            COALESCE(array_agg(((closed_at AT TIME ZONE 'Asia/Kolkata')::date - acquired_day)) FILTER (WHERE state = 'Completed' AND acquired_day IS NOT NULL), '{}') AS days
     FROM (${SALES_EFFECTIVE}) s WHERE s.branch_id = ANY($2::uuid[]) AND to_char(closed_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') BETWEEN $3 AND $4 GROUP BY 1, 2`, [tenantId, branchIds, fromMonth, toMonth]);
  return rows.map((r) => ({ month: String(r.m), state: String(r.state), count: Number(r.n), profit: Number(r.profit), days: (r.days as number[]).map((d) => Math.max(0, Number(d))) }));
}

export async function listSales(c: SqlClient, tenantId: string, branchIds: string[], fromMonth: string, toMonth: string, page: number, size: number) {
  const limit = Math.min(Math.max(1, size), 200);
  const rows = await q(c,
    `SELECT s.*, count(*) OVER () AS total FROM (${SALES_EFFECTIVE}) s WHERE s.branch_id = ANY($2::uuid[]) AND to_char(closed_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') BETWEEN $3 AND $4
     ORDER BY s.closed_at DESC, s.sale_id COLLATE "C" LIMIT $5 OFFSET $6`, [tenantId, branchIds, fromMonth, toMonth, limit, (Math.max(1, page) - 1) * limit]);
  return { sales: rows.map(toSale), total: rows.length ? Number(rows[0].total) : 0 };
}

/* ------------------------------------------------------------------ leads */

export type LeadFilter = { stage: string; owner?: string; source?: string; vehicle?: string; createdDays: string; overdue?: boolean; mineName?: string; q?: string; page: number; size: number };

export async function listLeads(c: SqlClient, tenantId: string, branchIds: string[], f: LeadFilter, now = new Date()) {
  const values: unknown[] = [tenantId, branchIds];
  const add = (v: unknown) => { values.push(v); return `$${values.length}`; };
  const where = ["l.tenant_id = $1", "l.branch_id = ANY($2::uuid[])"];
  if (f.stage !== "all") where.push(`l.stage = ${add(f.stage)}`);
  if (f.owner) where.push(`l.owner = ${add(f.owner)}`);
  if (f.source) where.push(`l.source = ${add(f.source)}`);
  if (f.vehicle) where.push(f.vehicle === "unspecified" ? "l.vehicle_stock_id IS NULL" : `l.vehicle_stock_id = ${add(f.vehicle)}`);
  if (f.createdDays !== "all") where.push(`l.created_at >= ${add(new Date(now.getTime() - Number(f.createdDays) * 86_400_000).toISOString())}::timestamptz`);
  if (f.overdue) where.push("l.overdue_flag");
  if (f.mineName) where.push(`l.owner = ${add(f.mineName)}`);
  if (f.q) where.push(`l.search LIKE ${add(`%${f.q.toLowerCase().replace(/[%_\\]/g, (m) => `\\${m}`)}%`)}`);
  const size = Math.min(Math.max(1, f.size), 200);
  const rows = (await c.query(
    `SELECT l.data, count(*) OVER () AS total FROM intelligence_lead_index l WHERE ${where.join(" AND ")} ORDER BY l.lead_id COLLATE "C" LIMIT ${add(size)} OFFSET ${add((Math.max(1, f.page) - 1) * size)}`, values)).rows as { data: Lead; total: string }[];
  const facets = (await c.query(
    `SELECT COALESCE(array_agg(DISTINCT owner ORDER BY owner), '{}') AS owners, COALESCE(array_agg(DISTINCT vehicle_stock_id ORDER BY vehicle_stock_id) FILTER (WHERE vehicle_stock_id IS NOT NULL), '{}') AS vehicles, count(*)::int AS total
     FROM intelligence_lead_index WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[])`, [tenantId, branchIds])).rows[0] as { owners: string[]; vehicles: string[]; total: number };
  return { leads: rows.map((r) => r.data), total: rows.length ? Number(rows[0].total) : 0, page: f.page, size, owners: facets.owners, vehicles: facets.vehicles, anyLeads: Number(facets.total) > 0 };
}

export async function stageCounts(c: SqlClient, tenantId: string, branchIds: string[]): Promise<Record<LeadStage | string, number>> {
  const rows = await q(c, "SELECT stage, count(*)::int AS n FROM intelligence_lead_index WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[]) GROUP BY 1", [tenantId, branchIds]);
  return Object.fromEntries(rows.map((r) => [String(r.stage), Number(r.n)]));
}

/** Funnel counts as lib/selectors.funnelFor, optionally limited to leads created in the given months. */
export async function funnelSql(c: SqlClient, tenantId: string, branchIds: string[], months?: readonly string[]) {
  const r = (await q(c,
    `SELECT count(*)::int AS enquiries,
            count(*) FILTER (WHERE stage IN ('Qualified','Appointment','Visited','Test drive','Negotiation','Won') OR has_sale)::int AS qualified,
            count(*) FILTER (WHERE stage IN ('Appointment','Visited','Test drive','Negotiation','Won') OR has_appointment)::int AS appointments,
            count(*) FILTER (WHERE stage IN ('Visited','Test drive','Negotiation','Won') OR has_sale)::int AS attended,
            count(*) FILTER (WHERE stage = 'Won' OR has_sale)::int AS sales_linked
     FROM intelligence_lead_index WHERE tenant_id = $1 AND branch_id = ANY($2::uuid[]) AND ($3::text[] IS NULL OR to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') = ANY($3::text[]))`,
    [tenantId, branchIds, months ? [...months] : null]))[0];
  return [
    { stage: "Enquiries", count: Number(r.enquiries) }, { stage: "Qualified", count: Number(r.qualified) }, { stage: "Appointments", count: Number(r.appointments) },
    { stage: "Attended", count: Number(r.attended) }, { stage: "Sales linked", count: Number(r.sales_linked) },
  ];
}
