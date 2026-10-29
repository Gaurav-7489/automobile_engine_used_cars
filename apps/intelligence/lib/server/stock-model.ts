import type { SqlClient } from "./db";
import { todayIst } from "./read-queries";

/**
 * Ageing and dead-stock review, computed in SQL over the read model so a dealership with thousands of vehicles never loads them all.
 * Rules mirror the legacy dead-stock report (age bands, capital locked, enquiry and price-change evidence) with two honest differences:
 * there is no public showroom, so view counts and publish status do not exist; and the recommendations are review prompts for staff only.
 */
export type StockPolicy = { bandLimits: [number, number, number]; lookbackDays: number; priceReviewAfterDays: number };
export const defaultStockPolicy: StockPolicy = { bandLimits: [30, 60, 90], lookbackDays: 30, priceReviewAfterDays: 21 };

export type StockAction = "inspect" | "follow_up" | "review_price";
export type StockRow = {
  stockId: string; label: string; branchId: string; status: string; ageDays: number; band: number; askingPaise: number | null;
  capitalPaise: number | null; enquiries: number | null; openLeads: number | null; lastPriceChange: string | null;
  recommendations: { action: StockAction; reason: string; evidence: string[] }[];
};
export type StockReport = {
  policy: StockPolicy; asOf: string; bandLabels: string[];
  bands: { label: string; vehicles: number; capitalPaise: number | null; costed: number }[];
  rows: StockRow[]; total: number; page: number; size: number; access: { capital: boolean; enquiries: boolean };
  assumptions: string[]; unavailable: string[];
};

export const bandLabels = (p: StockPolicy): string[] => { const [a, b, c] = p.bandLimits; return [`0–${a} days`, `${a + 1}–${b} days`, `${b + 1}–${c} days`, `Over ${c} days`]; };

export async function stockReport(c: SqlClient, tenantId: string, branchIds: string[], opts: { capital: boolean; enquiries: boolean; band?: number; action?: StockAction; page: number; size: number; policy?: StockPolicy; today?: string }): Promise<StockReport> {
  const policy = opts.policy ?? defaultStockPolicy, today = opts.today ?? todayIst();
  const [l1, l2, l3] = policy.bandLimits;
  const size = Math.min(Math.max(1, opts.size), 100), page = Math.max(1, opts.page);
  const rows = (await c.query(
    `WITH base AS (
       SELECT v.stock_id, v.branch_id, v.status, v.asking_paise, v.landed_paise, v.cost_complete, v.has_images, v.data,
              GREATEST(0, $3::date - v.acquired_day) AS age
       FROM intelligence_vehicle_index v
       WHERE v.tenant_id = $1 AND v.branch_id = ANY($2::uuid[]) AND v.status IN ('available','reserved','preparation')
     ), banded AS (
       SELECT b.*, CASE WHEN age <= $4 THEN 0 WHEN age <= $5 THEN 1 WHEN age <= $6 THEN 2 ELSE 3 END AS band FROM base b
     ), lead AS (
       SELECT l.vehicle_stock_id AS sid,
              count(*) FILTER (WHERE l.created_at >= now() - make_interval(days => $7::int))::int AS enq,
              count(*) FILTER (WHERE l.stage NOT IN ('Won','Lost'))::int AS open
       FROM intelligence_lead_index l WHERE l.tenant_id = $1 AND l.vehicle_stock_id IS NOT NULL GROUP BY l.vehicle_stock_id
     ), price AS (
       SELECT vh.stock_id AS sid, max(h.occurred_at) AS last_change
       FROM inventory_history h JOIN vehicles vh ON vh.tenant_id = h.tenant_id AND vh.id = h.vehicle_id
       WHERE h.tenant_id = $1 AND (h.payload->'before'->>'price') IS DISTINCT FROM (h.payload->'after'->>'price') AND (h.payload->>'action') <> 'created'
       GROUP BY vh.stock_id
     )
     SELECT b.stock_id, b.branch_id, b.status, b.age, b.band, b.asking_paise, b.landed_paise, b.cost_complete, b.has_images,
            b.data->>'year' AS year, b.data->>'make' AS make, b.data->>'model' AS model,
            COALESCE(l.enq, 0) AS enq, COALESCE(l.open, 0) AS open, p.last_change::text AS last_change
     FROM banded b LEFT JOIN lead l ON l.sid = b.stock_id LEFT JOIN price p ON p.sid = b.stock_id
     ORDER BY b.age DESC, b.stock_id COLLATE "C"`,
    [tenantId, branchIds, today, l1, l2, l3, policy.lookbackDays])).rows as Record<string, unknown>[];

  const labels = bandLabels(policy);
  const nowMs = Date.parse(`${today}T12:00:00Z`);
  const built: StockRow[] = rows.map((r) => {
    const age = Number(r.age), band = Number(r.band), status = String(r.status);
    const enquiries = opts.enquiries ? Number(r.enq) : null, openLeads = opts.enquiries ? Number(r.open) : null;
    const last = r.last_change ? String(r.last_change) : null;
    const sincePrice = last ? Math.floor((nowMs - Date.parse(last.replace(" ", "T"))) / 86_400_000) : null;
    const issues: string[] = [];
    if (r.asking_paise === null) issues.push("No asking price");
    if (!r.has_images) issues.push("No photographs");
    if (!r.cost_complete) issues.push("Cost record incomplete");
    const recs: StockRow["recommendations"] = [];
    if (issues.length) recs.push({ action: "inspect", reason: "Record is incomplete", evidence: issues });
    const aged = band >= 1, reserved = status === "reserved";
    if (opts.enquiries && aged && Number(r.open) > 0) recs.push({ action: "follow_up", reason: "Open enquiries on aged stock", evidence: [`${r.open} open ${Number(r.open) === 1 ? "enquiry" : "enquiries"}`] });
    if (opts.enquiries && aged && !reserved && Number(r.enq) === 0 && (sincePrice === null || sincePrice >= policy.priceReviewAfterDays))
      recs.push({ action: "review_price", reason: "No enquiries in the activity window", evidence: [`${age} days in stock`, `0 enquiries in ${policy.lookbackDays} days`, last ? `Last price change ${sincePrice} days ago` : "No recorded price change", "Compare with permitted market evidence before changing price"] });
    return { stockId: String(r.stock_id), label: `${r.year} ${r.make} ${r.model}`.trim(), branchId: String(r.branch_id), status, ageDays: age, band,
      askingPaise: r.asking_paise === null ? null : Number(r.asking_paise), capitalPaise: opts.capital && r.cost_complete ? Number(r.landed_paise) : null, enquiries, openLeads, lastPriceChange: last, recommendations: recs };
  });

  const bands = labels.map((label, i) => {
    const inBand = built.filter((r) => r.band === i), costed = inBand.filter((r) => r.capitalPaise !== null);
    return { label, vehicles: inBand.length, capitalPaise: opts.capital ? costed.reduce((s, r) => s + (r.capitalPaise ?? 0), 0) : null, costed: costed.length };
  });
  const filtered = built.filter((r) => (opts.band === undefined || r.band === opts.band) && (!opts.action || r.recommendations.some((x) => x.action === opts.action)));
  return {
    policy, asOf: today, bandLabels: labels, bands, rows: filtered.slice((page - 1) * size, page * size), total: filtered.length, page, size,
    access: { capital: opts.capital, enquiries: opts.enquiries },
    assumptions: [
      "Age is whole India calendar days since the recorded acquisition date.",
      `Enquiries are leads linked to the vehicle in the last ${policy.lookbackDays} days.`,
      "Capital locked counts only vehicles with a complete cost record; missing costs are never treated as zero.",
      "Recommendations are prompts for staff review. Prices are never changed or proposed automatically.",
    ],
    unavailable: [
      "Page views and publish status are not used: this is a private platform with no public showroom.",
      "Transfer recommendations: no permitted cross-location demand evidence is connected.",
      ...(opts.capital ? [] : ["Capital locked requires capital access."]),
      ...(opts.enquiries ? [] : ["Enquiries and follow-ups require lead access; price reviews are not suggested without enquiry evidence."]),
    ],
  };
}
