import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Vehicle } from "../domain";
import { plain, tenantTx, type SqlClient } from "./db";
import { cronSecret } from "./report-delivery";
import { runKnowledgeCron } from "./knowledge";
import { later } from "./later";

/**
 * Signed inventory-change webhooks to a connected dealership website (Website integration v2).
 *
 * Rows are written to intelligence_webhook_outbox inside the same transaction as the vehicle change, so an event exists if and
 * only if the change committed. Delivery happens after the commit (never while a transaction is open), retries with backoff, and
 * is caught up by the daily job and whenever the website next reads its stock. The website's periodic refresh remains the
 * fallback, so a lost event only delays an update; it never leaves the site wrong for longer than its refresh window.
 *
 * Payloads name stock ids and what kind of change happened, nothing else: no prices, costs, margins or customer data. The website
 * re-reads the published stock through the authenticated inventory API.
 *
 * Signature: `X-VandLabs-Signature: v1=<hex HMAC-SHA256(secret, "<timestamp>.<body>")>` with `X-VandLabs-Timestamp` (Unix seconds)
 * and `X-VandLabs-Event-Id`. The secret is the hex SHA-256 of the website key, which the website can compute and Intelligence
 * already stores, so connecting needs nothing new copied anywhere. Receivers reject timestamps more than five minutes off and
 * event ids they have already processed.
 */

export type InventoryChange = "published" | "unpublished" | "price" | "images" | "reserved" | "sold" | "available" | "details";
export type InventoryEvent = { id: string; type: "inventory.changed"; occurredAt: string; vehicles: { stockId: string; changes: InventoryChange[] }[] };

const MAX_ATTEMPTS = 10;
type Row = Record<string, unknown>;
/** Mirrors how a vehicle is saved (workspace-store persistVehicles): only an available, photographed, priced car stays published. */
const published = (v: Vehicle) => v.channels.includes("Owned site") && v.status === "available" && v.hasImages && (v.asking ?? 0) > 0;

/** What changed for the public website, or nothing for internal-only edits (costs, documents, notes). */
export function websiteChanges(before: Vehicle | undefined, after: Vehicle): InventoryChange[] {
  const out = new Set<InventoryChange>();
  const wasLive = before ? published(before) : false;
  const isLive = published(after);
  if (!wasLive && isLive) out.add("published");
  if (wasLive && !isLive) out.add("unpublished");
  if (!before) return [...out];
  if (before.asking !== after.asking) out.add("price");
  if (JSON.stringify(before.photos ?? []) !== JSON.stringify(after.photos ?? []) || before.hasImages !== after.hasImages) out.add("images");
  if (before.status !== after.status) {
    if (after.status === "sold") out.add("sold");
    else if (after.status === "reserved") out.add("reserved");
    else if (after.status === "available") out.add("available");
  }
  const pub = (v: Vehicle) => JSON.stringify([v.make, v.model, v.variant, v.year, v.fuel, v.transmission, v.km, v.owners, v.branchId]);
  if (pub(before) !== pub(after)) out.add("details");
  // Changes to a car that is not and was not on the website do not concern it.
  if (!wasLive && !isLive) return [];
  return [...out];
}

/** Queues one event per connected website, inside the caller's transaction. Returns how many were queued. */
export async function enqueueInventoryEvents(c: SqlClient, tenantId: string, before: readonly Vehicle[], after: readonly Vehicle[]): Promise<number> {
  const prev = new Map(before.map((v) => [v.id, v]));
  const vehicles = after.map((v) => ({ stockId: v.id, changes: websiteChanges(prev.get(v.id), v) })).filter((v) => v.changes.length);
  if (!vehicles.length) return 0;
  const keys = (await c.query("SELECT id FROM intelligence_api_keys WHERE tenant_id = $1 AND site_origin IS NOT NULL AND revoked_at IS NULL AND expires_at > now() AND name LIKE 'Website: %'", [tenantId])).rows as Row[];
  for (const k of keys) {
    const event: InventoryEvent = { id: randomUUID(), type: "inventory.changed", occurredAt: new Date().toISOString(), vehicles };
    await c.query("INSERT INTO intelligence_webhook_outbox (id, tenant_id, key_id, event_type, payload) VALUES ($1, $2, $3, $4, $5)", [event.id, tenantId, k.id, event.type, JSON.stringify(event)]);
  }
  return keys.length;
}

export const sign = (secret: string, timestamp: number, body: string) => `v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;

/** Receiver-side check, shared with tests and documented for website templates. */
export function verifySignature(secret: string, timestamp: string, body: string, signature: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || Math.abs(nowSeconds - ts) > 300) return false;
  const expected = Buffer.from(sign(secret, ts, body));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Sends this workspace's due webhooks. Rows are claimed (moved forward in time) in one short transaction, sent with no transaction
 * open, and recorded in another, so a slow website never holds a database connection or lock.
 */
export async function deliverWebhooks(tenantId: string, limit = 20, fetcher: typeof fetch = fetch): Promise<{ attempted: number; delivered: number }> {
  const tenant = tenantId.toLowerCase();
  const due = await tenantTx(tenant, async (c) => (await c.query(
    `UPDATE intelligence_webhook_outbox o SET next_attempt_at = now() + interval '2 minutes'
     FROM intelligence_api_keys k
     WHERE o.id IN (SELECT id FROM intelligence_webhook_outbox WHERE tenant_id = $1 AND status = 'pending' AND next_attempt_at <= now() ORDER BY created_at LIMIT $2 FOR UPDATE SKIP LOCKED)
       AND k.id = o.key_id AND k.tenant_id = o.tenant_id
     RETURNING o.id, o.payload, o.attempts, k.key_hash, k.site_origin, k.revoked_at, k.expires_at`,
    [tenant, limit],
  )).rows as Row[]);
  let delivered = 0;
  for (const row of due) {
    const keyGone = Boolean(row.revoked_at) || !row.site_origin || new Date(String(row.expires_at)).getTime() <= Date.now();
    let error: string | null = keyGone ? "website disconnected" : null;
    if (!keyGone) {
      const body = JSON.stringify(row.payload);
      const ts = Math.floor(Date.now() / 1000);
      try {
        const res = await fetcher(new URL("/api/webhooks/inventory", String(row.site_origin)), {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-VandLabs-Event-Id": String(row.id), "X-VandLabs-Timestamp": String(ts), "X-VandLabs-Signature": sign(String(row.key_hash), ts, body) },
          body,
          redirect: "error",
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) error = `HTTP ${res.status}`;
      } catch (e) {
        error = e instanceof Error ? e.message.slice(0, 120) : "unreachable";
      }
    }
    const attempts = Number(row.attempts) + 1;
    await tenantTx(tenant, (c) => error
      ? c.query("UPDATE intelligence_webhook_outbox SET attempts = $2, last_error = $3, status = CASE WHEN $4 THEN 'failed' ELSE 'pending' END, next_attempt_at = now() + make_interval(secs => $5) WHERE tenant_id = $6 AND id = $1",
        [row.id, attempts, error, keyGone || attempts >= MAX_ATTEMPTS, Math.min(6 * 3600, 30 * 2 ** (attempts - 1)), tenant])
      : c.query("UPDATE intelligence_webhook_outbox SET attempts = $2, status = 'delivered', delivered_at = now(), last_error = NULL WHERE tenant_id = $3 AND id = $1", [row.id, attempts, tenant]));
    if (!error) delivered++;
    else console.warn(JSON.stringify({ event: "website_webhook_failed", attempts, message: error }));
  }
  return { attempted: due.length, delivered };
}

/** Daily safety net (Vercel Cron, Bearer CRON_SECRET): every workspace with webhooks due, plus retention of old rows. */
export async function runWebhookCron(authorization: string | null): Promise<{ status: number; body: Record<string, unknown> }> {
  const secret = cronSecret();
  const given = Buffer.from(authorization ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) return { status: 401, body: { error: "unauthorized" } };
  const tenants = (await plain((c) => c.query("SELECT tenant_id FROM intelligence_webhook_due_tenants(200)"))).rows as Row[];
  let attempted = 0, delivered = 0;
  for (const t of tenants) {
    const r = await deliverWebhooks(String(t.tenant_id), 50).catch(() => ({ attempted: 0, delivered: 0 }));
    attempted += r.attempted;
    delivered += r.delivered;
  }
  // The same daily job re-reads linked websites for the AI agents (Vercel Hobby allows two cron jobs, both in use).
  const knowledge = await runKnowledgeCron().catch((error: unknown) => {
    console.error(JSON.stringify({ event: "knowledge_cron_failure", message: error instanceof Error ? error.message : "unknown" }));
    return { tenants: 0, refreshed: 0 };
  });
  return { status: 200, body: { ok: true, tenants: tenants.length, attempted, delivered, knowledge } };
}

/** Delivers this workspace's webhooks after the response. Outside a request it leaves them to the next check-in or the daily job. */
export function deliverSoon(tenantId: string): void {
  later(() => deliverWebhooks(tenantId), { outside: "skip" });
}
