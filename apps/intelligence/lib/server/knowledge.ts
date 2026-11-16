import { plain, tenantTx, type SqlClient } from "./db";
import { siteOrigin } from "./website-connect";

/**
 * Dealership knowledge for the AI agents: what the dealership's own website says (showroom, timings, services, process,
 * policies, its Q&A) plus short entries the owner writes. Stored per dealership as passages and searched with PostgreSQL
 * full-text search.
 *
 * Car facts are deliberately not taken from web pages: prices and availability come only from the live records, so a cached page
 * can never make an agent quote a sold car or an old price. Car detail pages are skipped.
 *
 * Reading is limited to the website VandLabs linked to this workspace (its origin was validated as public https when linked),
 * same-origin pages from its sitemap, at most MAX_PAGES pages of at most MAX_PAGE_BYTES each.
 */

export const MAX_PAGES = 40;
const MAX_PAGE_BYTES = 1_500_000;
const PASSAGE_CHARS = 1100;
const MANUAL_MAX = 60;
const STALE_MS = 20 * 3600_000;

export type Passage = { title: string; url: string | null; text: string; source: "website" | "manual" };
type Fetcher = typeof fetch;

/* Extraction ---------------------------------------------------------------------------------------------------------------- */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', ndash: "-", mdash: "-", hellip: "...", rupee: "₹" };
export const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " "; }
  return ENTITIES[e.toLowerCase()] ?? m;
});
const squash = (s: string) => s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, " ").replace(/[ \t\f\r]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

/** Same-origin page addresses from a sitemap, car detail pages excluded. */
export function sitemapUrls(xml: string, origin: string): string[] {
  const out = new Set<string>();
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    try {
      const u = new URL(decode(m[1]));
      if (u.origin !== origin || !/^https?:$/.test(u.protocol)) continue;
      if (/^\/collection\/[^/]+/.test(u.pathname) || /^\/(api|connect|shortlist)(\/|$)/.test(u.pathname)) continue;
      u.hash = "";
      out.add(u.toString());
    } catch { /* not a URL */ }
  }
  return [...out];
}

/** The readable text of a page: its title, its main content (navigation, scripts and styling removed) and any FAQPage Q&A. */
export function pageText(html: string): { title: string; text: string } {
  const title = squash(decode((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").replace(/<[^>]+>/g, ""))).slice(0, 160);
  const faq: string[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]) as unknown;
      for (const item of Array.isArray(data) ? data : [data]) {
        const node = item as { "@type"?: unknown; mainEntity?: unknown };
        if (node["@type"] !== "FAQPage" || !Array.isArray(node.mainEntity)) continue;
        for (const q of node.mainEntity as { name?: unknown; acceptedAnswer?: { text?: unknown } }[]) {
          if (typeof q.name === "string" && typeof q.acceptedAnswer?.text === "string") faq.push(`Q: ${q.name}\nA: ${q.acceptedAnswer.text}`);
        }
      }
    } catch { /* not JSON */ }
  }
  let body = /<main[\s\S]*?>([\s\S]*?)<\/main>/i.exec(html)?.[1] ?? /<body[\s\S]*?>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? html;
  body = body
    .replace(/<(script|style|noscript|svg|template|iframe|form|nav|header|footer)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article|\/dd|\/dt)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = squash([squash(decode(body)), ...faq].filter(Boolean).join("\n"));
  return { title, text };
}

/** Passages of about PASSAGE_CHARS, split on paragraph and sentence boundaries, each carrying its page title for context. */
export function toPassages(title: string, text: string): string[] {
  const parts = text.split(/\n+/).flatMap((p) => (p.length > PASSAGE_CHARS ? p.split(/(?<=[.!?])\s+/) : [p])).map((p) => p.trim()).filter((p) => p.length > 1);
  const out: string[] = [];
  let buf = "";
  for (const p of parts) {
    if (buf && buf.length + p.length + 1 > PASSAGE_CHARS) { out.push(buf); buf = ""; }
    buf = buf ? `${buf}\n${p}` : p.slice(0, PASSAGE_CHARS * 2);
  }
  if (buf) out.push(buf);
  // Very short pages (a heading and a phone number) are still kept: they are often the answer.
  return out.filter((p) => p.replace(/\s/g, "").length >= 20).slice(0, 30).map((p) => (title ? `${title}\n${p}` : p));
}

async function getText(url: string, fetcher: Fetcher, accept: string): Promise<string | null> {
  const res = await fetcher(url, { headers: { accept, "user-agent": "VandLabs-Intelligence/1 (dealership knowledge)" }, redirect: "error", signal: AbortSignal.timeout(6000), cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_PAGE_BYTES) return null;
  const body = await res.text().catch(() => "");
  return body.length > MAX_PAGE_BYTES ? body.slice(0, MAX_PAGE_BYTES) : body;
}

/* Refresh ------------------------------------------------------------------------------------------------------------------- */

/** The linked website's origin for this workspace, if it has one that may be read. */
async function linkedOrigin(c: SqlClient, tenantId: string): Promise<string | null> {
  const row = (await c.query("SELECT site_origin FROM intelligence_api_keys WHERE tenant_id = $1 AND name LIKE 'Website: %' AND site_origin IS NOT NULL AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1", [tenantId])).rows[0] as { site_origin: string } | undefined;
  return row ? siteOrigin(row.site_origin) : null;
}

export type RefreshResult = { status: "ok" | "failed" | "no_website"; pages: number; passages: number; error?: string };

/** Reads the linked website again and replaces its passages. Manual entries are untouched. A failed read keeps the previous passages. */
export async function refreshKnowledge(tenantId: string, fetcher: Fetcher = fetch, deadline = Date.now() + 45_000): Promise<RefreshResult> {
  const tenant = tenantId.toLowerCase();
  const origin = await tenantTx(tenant, (c) => linkedOrigin(c, tenant));
  const record = (r: RefreshResult) => tenantTx(tenant, (c) => c.query(
    `INSERT INTO intelligence_knowledge_sync (tenant_id, site_origin, last_run_at, last_success_at, pages, passages, status, error) VALUES ($1, $2, now(), CASE WHEN $3 = 'ok' THEN now() END, $4, $5, $3, $6)
     ON CONFLICT (tenant_id) DO UPDATE SET site_origin = EXCLUDED.site_origin, last_run_at = now(), last_success_at = CASE WHEN $3 = 'ok' THEN now() ELSE intelligence_knowledge_sync.last_success_at END,
       pages = CASE WHEN $3 = 'ok' THEN $4 ELSE intelligence_knowledge_sync.pages END, passages = CASE WHEN $3 = 'ok' THEN $5 ELSE intelligence_knowledge_sync.passages END, status = $3, error = $6`,
    [tenant, origin, r.status, r.pages, r.passages, r.error ?? null])).then(() => r);
  if (!origin) return record({ status: "no_website", pages: 0, passages: 0 });

  const sitemap = await getText(`${origin}/sitemap.xml`, fetcher, "application/xml,text/xml");
  const urls = sitemap ? sitemapUrls(sitemap, origin) : [];
  if (!urls.includes(`${origin}/`)) urls.unshift(`${origin}/`);
  const rows: { url: string; title: string; content: string; position: number }[] = [];
  let pages = 0;
  const list = urls.slice(0, MAX_PAGES);
  // A few pages at a time, so a normal site is read in seconds; a slow one stops at the deadline and keeps its previous passages.
  for (let i = 0; i < list.length; i += 5) {
    if (Date.now() > deadline) return record({ status: "failed", pages: 0, passages: 0, error: "The website was too slow to read in time" });
    const batch = await Promise.all(list.slice(i, i + 5).map(async (url) => ({ url, html: await getText(url, fetcher, "text/html") })));
    for (const { url, html } of batch) {
      if (!html) continue;
      const { title, text } = pageText(html);
      const passages = toPassages(title, text);
      if (!passages.length) continue;
      pages++;
      passages.forEach((content, position) => rows.push({ url, title: title || new URL(url).pathname, content, position }));
    }
  }
  if (!pages) return record({ status: "failed", pages: 0, passages: 0, error: sitemap ? "No readable pages" : "The website could not be read" });
  await tenantTx(tenant, async (c) => {
    await c.query("DELETE FROM intelligence_knowledge WHERE tenant_id = $1 AND source = 'website'", [tenant]);
    for (const r of rows) await c.query("INSERT INTO intelligence_knowledge (tenant_id, source, url, title, content, position) VALUES ($1, 'website', $2, $3, $4, $5)", [tenant, r.url, r.title.slice(0, 160), r.content, r.position]);
  });
  return record({ status: "ok", pages, passages: rows.length });
}

/** Refreshes in the background when the website was last read long ago. Never throws. */
export async function refreshIfStale(tenantId: string, fetcher: Fetcher = fetch): Promise<void> {
  try {
    const row = (await tenantTx(tenantId, (c) => c.query("SELECT last_run_at FROM intelligence_knowledge_sync WHERE tenant_id = $1", [tenantId]))).rows[0] as { last_run_at: string | null } | undefined;
    if (row?.last_run_at && Date.now() - new Date(row.last_run_at).getTime() < STALE_MS) return;
    await refreshKnowledge(tenantId, fetcher);
  } catch (error) {
    console.error(JSON.stringify({ event: "knowledge_refresh_failure", message: error instanceof Error ? error.message : "unknown" }));
  }
}

/* Search -------------------------------------------------------------------------------------------------------------------- */

const words = (q: string) => [...new Set(q.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]{2,}/gu) ?? [])].slice(0, 12);

/** The best passages for a question: all words first, then any word, ranked by PostgreSQL full-text relevance. */
export async function searchKnowledge(tenantId: string, query: string, limit = 5): Promise<Passage[]> {
  return tenantTx(tenantId.toLowerCase(), (c) => searchKnowledgeIn(c, tenantId, query, limit));
}

/** searchKnowledge inside a transaction that already selected this tenant. */
export async function searchKnowledgeIn(c: SqlClient, tenantId: string, query: string, limit = 5): Promise<Passage[]> {
  const q = query.slice(0, 300);
  const terms = words(q);
  if (!terms.length) return [];
  const tenant = tenantId.toLowerCase();
  {
    const run = async (sql: string, arg: string) => (await c.query(
      `SELECT title, url, content, source FROM intelligence_knowledge, ${sql} AS q WHERE tenant_id = $1 AND tsv @@ q ORDER BY ts_rank_cd(tsv, q) DESC, source DESC, position LIMIT $3`,
      [tenant, arg, Math.min(Math.max(limit, 1), 8)])).rows as Record<string, unknown>[];
    let rows = await run("websearch_to_tsquery('english', $2)", q);
    if (!rows.length) rows = await run("to_tsquery('english', $2)", terms.map((t) => `${t.replace(/[^\p{L}\p{N}]/gu, "")}:*`).filter((t) => t.length > 2).join(" | ") || "zzzz");
    return rows.map((r) => ({ title: String(r.title), url: (r.url as string | null) ?? null, text: String(r.content).slice(0, 1600), source: r.source as "website" | "manual" }));
  }
}

/* Manual entries and status ------------------------------------------------------------------------------------------------- */

export type KnowledgeEntry = { id: string; title: string; content: string; updatedAt: string; createdBy: string | null };
export type KnowledgeStatus = { website: { origin: string | null; status: string; lastRunAt: string | null; lastSuccessAt: string | null; pages: number; passages: number; error: string | null }; entries: KnowledgeEntry[] };

export async function knowledgeStatus(tenantId: string): Promise<KnowledgeStatus> {
  return tenantTx(tenantId, async (c) => {
    const s = (await c.query("SELECT * FROM intelligence_knowledge_sync WHERE tenant_id = $1", [tenantId])).rows[0] as Record<string, unknown> | undefined;
    const origin = await linkedOrigin(c, tenantId);
    const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);
    const entries = ((await c.query("SELECT id, title, content, updated_at, created_by FROM intelligence_knowledge WHERE tenant_id = $1 AND source = 'manual' ORDER BY position, updated_at", [tenantId])).rows as Record<string, unknown>[])
      .map((r) => ({ id: String(r.id), title: String(r.title), content: String(r.content), updatedAt: iso(r.updated_at)!, createdBy: (r.created_by as string | null) ?? null }));
    return { website: { origin, status: origin ? String(s?.status ?? "never") : "no_website", lastRunAt: iso(s?.last_run_at), lastSuccessAt: iso(s?.last_success_at), pages: Number(s?.pages ?? 0), passages: Number(s?.passages ?? 0), error: (s?.error as string | null) ?? null }, entries };
  });
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");

export function validateEntry(raw: Record<string, unknown>): { entry: { title: string; content: string } | null; fields: Record<string, string> } {
  const title = clean(raw.title, 120);
  const content = clean(raw.content, 2000);
  const fields: Record<string, string> = {};
  if (title.length < 3) fields.title = "Give it a short title, for example Opening hours.";
  if (content.length < 3) fields.content = "Write what customers should be told.";
  return Object.keys(fields).length ? { entry: null, fields } : { entry: { title, content }, fields };
}

export async function saveEntry(tenantId: string, by: string, entry: { title: string; content: string }, id?: string): Promise<KnowledgeEntry | null> {
  return tenantTx(tenantId, async (c) => {
    if (id) {
      const r = (await c.query("UPDATE intelligence_knowledge SET title = $3, content = $4, created_by = $5, updated_at = now() WHERE tenant_id = $1 AND id = $2 AND source = 'manual' RETURNING id, title, content, updated_at, created_by", [tenantId, id, entry.title, entry.content, by])).rows[0] as Record<string, unknown> | undefined;
      return r ? { id: String(r.id), title: String(r.title), content: String(r.content), updatedAt: new Date(String(r.updated_at)).toISOString(), createdBy: by } : null;
    }
    const count = Number((await c.query("SELECT count(*)::int AS n FROM intelligence_knowledge WHERE tenant_id = $1 AND source = 'manual'", [tenantId])).rows[0].n);
    if (count >= MANUAL_MAX) return null;
    const r = (await c.query("INSERT INTO intelligence_knowledge (tenant_id, source, title, content, position, created_by) VALUES ($1, 'manual', $2, $3, $4, $5) RETURNING id, updated_at", [tenantId, entry.title, entry.content, count, by])).rows[0] as Record<string, unknown>;
    return { id: String(r.id), title: entry.title, content: entry.content, updatedAt: new Date(String(r.updated_at)).toISOString(), createdBy: by };
  });
}

export async function deleteEntry(tenantId: string, id: string): Promise<boolean> {
  return tenantTx(tenantId, async (c) => (await c.query("DELETE FROM intelligence_knowledge WHERE tenant_id = $1 AND id = $2 AND source = 'manual' RETURNING id", [tenantId, id])).rows.length > 0);
}

/** For the daily job: workspaces whose linked website was not read in the last 20 hours. */
export async function dueKnowledgeTenants(c: SqlClient, limit = 100): Promise<string[]> {
  return ((await c.query("SELECT tenant_id FROM intelligence_knowledge_due_tenants($1)", [limit])).rows as { tenant_id: string }[]).map((r) => String(r.tenant_id));
}

/** The daily job: re-reads stale websites until the time budget is spent. The rest are picked up the next day or on first use. */
export async function runKnowledgeCron(budgetMs = 25_000, fetcher: Fetcher = fetch): Promise<{ tenants: number; refreshed: number }> {
  const stop = Date.now() + budgetMs;
  const due = await plain((c) => dueKnowledgeTenants(c, 50));
  let refreshed = 0;
  for (const tenant of due) {
    if (Date.now() > stop) break;
    const r = await refreshKnowledge(tenant, fetcher, stop + 10_000).catch(() => null);
    if (r?.status === "ok") refreshed++;
  }
  return { tenants: due.length, refreshed };
}
