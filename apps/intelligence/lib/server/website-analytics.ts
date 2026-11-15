import { createHash } from "node:crypto";
import { tenantTx, type SqlClient } from "./db";

/**
 * Website analytics for a connected dealership website: a deliberately small, cookieless event schema stored only as daily
 * counts. No IP address, user agent, name or contact is stored. The website sends a random per-tab session id (never persisted
 * beyond the tab) solely so a visit or a car view is counted once; its salted hash lives in intelligence_website_seen for two days.
 *
 * Enquiry figures are not taken from these events: they are counted from enquiries actually recorded (intelligence_website_enquiries),
 * so they cannot be inflated by a script. WhatsApp and call clicks are counted as clicks, never as leads.
 */

export const EVENT_TYPES = ["visit", "vehicle_view", "whatsapp_click", "call_click"] as const;
export type WebsiteEventType = (typeof EVENT_TYPES)[number];
export type WebsiteEvent = { type: WebsiteEventType; sid: string; stockId?: string; source?: string; medium?: string; campaign?: string; device?: "mobile" | "tablet" | "desktop" };

const SID = /^[A-Za-z0-9_-]{16,64}$/;
const STOCK = /^[A-Za-z0-9-]{1,40}$/;
const tokenOf = (v: unknown, max: number) => { const s = typeof v === "string" ? v.trim().toLowerCase().slice(0, max) : ""; return /^[a-z0-9_.-]+$/.test(s) ? s : undefined; };
const RETENTION_DAYS = 400;

/** Valid events only; anything else in the batch is dropped silently (a client bug must not break counting). */
export function parseEvents(raw: unknown): WebsiteEvent[] {
  const list = Array.isArray((raw as { events?: unknown })?.events) ? ((raw as { events: unknown[] }).events) : [];
  const out: WebsiteEvent[] = [];
  for (const e of list.slice(0, 20)) {
    const r = (e ?? {}) as Record<string, unknown>;
    const type = EVENT_TYPES.find((t) => t === r.type);
    if (!type || typeof r.sid !== "string" || !SID.test(r.sid)) continue;
    const stockId = typeof r.stockId === "string" && STOCK.test(r.stockId) ? r.stockId.toUpperCase() : undefined;
    if (type === "vehicle_view" && !stockId) continue;
    const device = r.device === "mobile" || r.device === "tablet" || r.device === "desktop" ? r.device : undefined;
    out.push({ type, sid: r.sid, stockId, source: tokenOf(r.source, 30), medium: tokenOf(r.medium, 30), campaign: tokenOf(r.campaign, 60), device });
  }
  return out;
}

const istDay = (d = new Date()) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

/** Adds a batch of events to the workspace's daily counts. Returns how many were counted (after dedupe). */
export async function recordEvents(tenantId: string, events: WebsiteEvent[]): Promise<number> {
  if (!events.length) return 0;
  const tenant = tenantId.toLowerCase();
  const day = istDay();
  return tenantTx(tenant, async (c) => {
    const stocks = [...new Set(events.map((e) => e.stockId).filter(Boolean))] as string[];
    // Only cars this workspace actually lists can collect views, so the "most viewed" list cannot be polluted with invented ids.
    const listed = new Set(stocks.length ? ((await c.query("SELECT upper(stock_id) AS s FROM vehicles WHERE tenant_id = $1 AND upper(stock_id) = ANY($2::text[]) AND publish_status = 'published'", [tenant, stocks])).rows as { s: string }[]).map((r) => r.s) : []);
    let counted = 0;
    for (const e of events) {
      if (e.stockId && !listed.has(e.stockId)) { if (e.type === "vehicle_view") continue; e.stockId = undefined; }
      const hash = createHash("sha256").update(`${tenant}|${day}|${e.sid}|${e.type}|${e.stockId ?? ""}`).digest("hex");
      const fresh = (await c.query("INSERT INTO intelligence_website_seen (tenant_id, day, hash) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING hash", [tenant, day, hash])).rows.length > 0;
      if (!fresh) continue;
      counted++;
      const dims = [""];
      if (e.stockId) dims.push(`stock:${e.stockId}`);
      if (e.type === "visit") {
        dims.push(`source:${e.source ?? "direct"}`);
        if (e.device) dims.push(`device:${e.device}`);
        if (e.campaign) dims.push(`campaign:${e.campaign}`);
      }
      for (const dim of dims) await bump(c, tenant, day, e.type, dim);
    }
    if (Math.random() < 0.02) {
      await c.query("DELETE FROM intelligence_website_seen WHERE tenant_id = $1 AND day < $2::date - 2", [tenant, day]);
      await c.query("DELETE FROM intelligence_website_metrics WHERE tenant_id = $1 AND day < $2::date - $3::int", [tenant, day, RETENTION_DAYS]);
    }
    return counted;
  });
}

const bump = (c: SqlClient, tenant: string, day: string, metric: string, dim: string) =>
  c.query("INSERT INTO intelligence_website_metrics (tenant_id, day, metric, dimension, count) VALUES ($1, $2, $3, $4, 1) ON CONFLICT (tenant_id, day, metric, dimension) DO UPDATE SET count = intelligence_website_metrics.count + 1", [tenant, day, metric, dim]);

export type WebsitePerformance = {
  connected: { site: string; lastSeenAt: string | null }[];
  days: number;
  totals: { visits: number; vehicleViews: number; enquiries: number; whatsappClicks: number; callClicks: number; conversionRate: number | null };
  enquiriesByType: { type: string; count: number }[];
  sources: { source: string; visits: number }[];
  campaigns: { campaign: string; visits: number }[];
  devices: { device: string; visits: number }[];
  topVehicles: { stockId: string; title: string; views: number; enquiries: number }[];
  daily: { day: string; visits: number; enquiries: number }[];
};

/** The dealer's website report for the last `days` days. Figures are counts of real events; nothing is estimated. */
export async function websitePerformance(tenantId: string, days: number): Promise<WebsitePerformance> {
  const span = Math.min(365, Math.max(1, Math.floor(days)));
  const tenant = tenantId.toLowerCase();
  const from = istDay(new Date(Date.now() - (span - 1) * 86_400_000));
  return tenantTx(tenant, async (c) => {
    const connected = ((await c.query("SELECT name, last_used_at FROM intelligence_api_keys WHERE tenant_id = $1 AND name LIKE 'Website: %' AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at", [tenant])).rows as Record<string, unknown>[])
      .map((r) => ({ site: String(r.name).slice("Website: ".length), lastSeenAt: r.last_used_at ? new Date(String(r.last_used_at)).toISOString() : null }));
    const metrics = (await c.query("SELECT day::text AS day, metric, dimension, count FROM intelligence_website_metrics WHERE tenant_id = $1 AND day >= $2::date", [tenant, from])).rows as { day: string; metric: string; dimension: string; count: number }[];
    const enquiries = (await c.query("SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS day, enquiry_type AS type, count(*)::int AS n FROM intelligence_website_enquiries WHERE tenant_id = $1 AND created_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Kolkata') GROUP BY 1, 2", [tenant, from])).rows as { day: string; type: string; n: number }[];
    const sum = (metric: string, pred: (d: string) => boolean = (d) => d === "") => metrics.filter((m) => m.metric === metric && pred(m.dimension)).reduce((a, m) => a + Number(m.count), 0);
    const group = (metric: string, prefix: string) => {
      const map = new Map<string, number>();
      for (const m of metrics) if (m.metric === metric && m.dimension.startsWith(prefix)) map.set(m.dimension.slice(prefix.length), (map.get(m.dimension.slice(prefix.length)) ?? 0) + Number(m.count));
      return [...map].sort((a, b) => b[1] - a[1]);
    };
    const visits = sum("visit");
    const enquiryTotal = enquiries.reduce((a, e) => a + e.n, 0);
    const byType = new Map<string, number>();
    for (const e of enquiries) byType.set(e.type, (byType.get(e.type) ?? 0) + e.n);
    const views = group("vehicle_view", "stock:").slice(0, 10);
    const leadsByStock = new Map(((await c.query("SELECT vehicle_stock_id AS s, count(*)::int AS n FROM intelligence_lead_index WHERE tenant_id = $1 AND source IN ('Website', 'WhatsApp') AND created_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Kolkata') AND vehicle_stock_id IS NOT NULL GROUP BY 1", [tenant, from])).rows as { s: string; n: number }[]).map((r) => [r.s.toUpperCase(), r.n]));
    const titles = new Map(views.length ? ((await c.query("SELECT upper(stock_id) AS s, payload FROM vehicles WHERE tenant_id = $1 AND upper(stock_id) = ANY($2::text[])", [tenant, views.map(([s]) => s)])).rows as { s: string; payload: Record<string, unknown> }[]).map((r) => [r.s, [r.payload.year, r.payload.make, r.payload.model, r.payload.variant].filter(Boolean).join(" ")]) : []);
    const daily: WebsitePerformance["daily"] = [];
    for (let i = span - 1; i >= 0; i--) {
      const day = istDay(new Date(Date.now() - i * 86_400_000));
      daily.push({ day, visits: metrics.filter((m) => m.day === day && m.metric === "visit" && m.dimension === "").reduce((a, m) => a + Number(m.count), 0), enquiries: enquiries.filter((e) => e.day === day).reduce((a, e) => a + e.n, 0) });
    }
    return {
      connected, days: span,
      totals: { visits, vehicleViews: sum("vehicle_view"), enquiries: enquiryTotal, whatsappClicks: sum("whatsapp_click"), callClicks: sum("call_click"), conversionRate: visits > 0 ? Math.round((enquiryTotal / visits) * 1000) / 10 : null },
      enquiriesByType: [...byType].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
      sources: group("visit", "source:").slice(0, 8).map(([source, v]) => ({ source, visits: v })),
      campaigns: group("visit", "campaign:").slice(0, 8).map(([campaign, v]) => ({ campaign, visits: v })),
      devices: group("visit", "device:").map(([device, v]) => ({ device, visits: v })),
      topVehicles: views.map(([stockId, v]) => ({ stockId, title: titles.get(stockId) || stockId, views: v, enquiries: leadsByStock.get(stockId) ?? 0 })),
      daily,
    };
  });
}
