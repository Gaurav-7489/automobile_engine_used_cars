import { randomUUID } from "node:crypto";
import type { SqlClient } from "./db";
import { tenantTx } from "./db";
import { roleOf } from "./identity";

type Row = Record<string, unknown>;

/**
 * New-enquiry emails. An enquiry queues a row in notification_outbox inside the same transaction that creates the lead, so a
 * notification is never lost and never sent for a lead that was not saved. Delivery runs after the response and again
 * whenever the dealership opens the workspace, so a failed or not-yet-configured send is retried without a scheduler.
 *
 * Emails carry no customer name or number: only the car, what was asked and a link into the signed-in workspace.
 */

const MAX_ATTEMPTS = 8;
const BATCH = 10;

export type MailConfig = { apiKey: string; from: string; origin: string; fallbackTo: string[] };

export function mailConfig(env: Record<string, string | undefined> = process.env): MailConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim(), from = env.NOTIFICATION_FROM?.trim(), origin = env.APP_ORIGIN?.trim();
  if (!apiKey || !from || !origin) return null;
  try { if (new URL(origin).protocol !== "https:" && env.NODE_ENV === "production") return null; } catch { return null; }
  return { apiKey, from, origin: origin.replace(/\/$/, ""), fallbackTo: (env.NOTIFICATION_TO ?? "").split(",").map((x) => x.trim()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)) };
}

/** Queues the email for a lead (by its workspace id, e.g. L-1001). Call inside the transaction that created the lead. */
export async function queueLeadEmail(c: SqlClient, tenantId: string, leadPublicId: string): Promise<void> {
  const lead = (await c.query("SELECT id FROM leads WHERE tenant_id = $1 AND payload->>'intelligenceId' = $2 LIMIT 1", [tenantId, leadPublicId])).rows[0] as Row | undefined;
  if (!lead) return;
  await c.query("INSERT INTO notification_outbox(id, tenant_id, lead_id) VALUES ($1, $2, $3)", [randomUUID(), tenantId, lead.id]);
}

/** Owners and managers who can see the lead's branch, unless the dealership turned lead notifications off. */
async function recipients(c: SqlClient, tenantId: string, branchId: string): Promise<{ to: string[]; off: boolean }> {
  const meta = (await c.query("SELECT payload FROM intelligence_documents WHERE tenant_id = $1 AND collection = 'meta' AND id = 'workspace'", [tenantId])).rows[0] as Row | undefined;
  const prefs = ((meta?.payload as Row | undefined)?.notifications ?? {}) as Record<string, boolean>;
  if (prefs["leads.assigned"] === false) return { to: [], off: true };
  const staff = (await c.query("SELECT payload FROM staff_members WHERE tenant_id = $1", [tenantId])).rows.map((r) => r.payload as Row);
  const to = staff.filter((s) => {
    const role = roleOf({ role: String(s.role ?? ""), intelligenceRole: s.intelligenceRole ? String(s.intelligenceRole) : undefined });
    const branches = Array.isArray(s.locationIds) ? (s.locationIds as unknown[]).map(String) : [];
    return s.enabled !== false && (role === "owner" || role === "manager") && branches.includes(branchId) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s.email ?? ""));
  }).map((s) => String(s.email));
  return { to: [...new Set(to)], off: false };
}

export function enquiryEmail(input: { origin: string; leadId: string; vehicle: string; note: string; dealer: string }): { subject: string; text: string } {
  // The interaction note reads "Website enquiry via instagram for 2024 Hyundai Creta SX (V-1001): I'd like a test drive. "message""; the customer's
  // own words stay in the workspace, so only the part before the quote is used here.
  const asked = input.note.split(" \"")[0].replace(/\s+/g, " ").trim();
  return {
    subject: `New enquiry: ${input.vehicle}`,
    text: `${asked || `A customer enquired about ${input.vehicle}.`}\n\nOpen the lead to see their details and respond:\n${input.origin}/app/leads/${encodeURIComponent(input.leadId)}\n\nA quick first response wins more sales.\n\n${input.dealer ? `${input.dealer} · ` : ""}VandLabs`,
  };
}

/** Sends this dealership's pending enquiry emails. Returns how many were sent; does nothing when email is not configured. */
export async function deliverPendingLeadEmails(tenantId: string, options: { config?: MailConfig | null; fetcher?: typeof fetch } = {}): Promise<{ sent: number; configured: boolean }> {
  const config = options.config === undefined ? mailConfig() : options.config;
  if (!config) return { configured: false, sent: 0 };
  const fetcher = options.fetcher ?? fetch;
  // Claim a batch in a short transaction; the provider is called with no transaction or lock held.
  const claimed = await tenantTx(tenantId, async (c) => {
    const rows = (await c.query(`
      UPDATE notification_outbox SET attempts = attempts + 1, available_at = now() + interval '2 minutes'
      WHERE id IN (SELECT id FROM notification_outbox WHERE tenant_id = $1 AND sent_at IS NULL AND attempts < $2 AND available_at <= now() AND created_at > now() - interval '3 days'
                   ORDER BY created_at LIMIT $3 FOR UPDATE SKIP LOCKED)
      RETURNING id, lead_id, attempts`, [tenantId, MAX_ATTEMPTS, BATCH])).rows as Row[];
    const out: { id: string; attempts: number; to: string[]; off: boolean; subject: string; text: string }[] = [];
    if (!rows.length) return out;
    const org = (await c.query("SELECT name FROM organizations WHERE tenant_id = $1 ORDER BY created_at LIMIT 1", [tenantId])).rows[0] as Row | undefined;
    for (const row of rows) {
      const lead = (await c.query("SELECT location_id, payload FROM leads WHERE tenant_id = $1 AND id = $2", [tenantId, row.lead_id])).rows[0] as Row | undefined;
      const publicId = String((lead?.payload as Row | undefined)?.intelligenceId ?? "");
      const index = publicId ? ((await c.query("SELECT data FROM intelligence_lead_index WHERE tenant_id = $1 AND lead_id = $2", [tenantId, publicId])).rows[0] as Row | undefined) : undefined;
      const data = (index?.data ?? {}) as { vehicleId?: string | null; interactions?: { detail: string }[] };
      const vehicleRow = data.vehicleId ? ((await c.query("SELECT payload FROM vehicles WHERE tenant_id = $1 AND stock_id = $2", [tenantId, data.vehicleId])).rows[0] as Row | undefined) : undefined;
      const vp = (vehicleRow?.payload ?? {}) as Row;
      const vehicle = vehicleRow ? `${[vp.year, vp.make, vp.model, vp.variant].filter(Boolean).join(" ")} (${data.vehicleId})` : "a car";
      const note = data.interactions?.at(-1)?.detail ?? "";
      const who = await recipients(c, tenantId, String(lead?.location_id ?? ""));
      const mail = enquiryEmail({ origin: config.origin, leadId: publicId || "", vehicle, note, dealer: String(org?.name ?? "") });
      out.push({ id: String(row.id), attempts: Number(row.attempts), to: who.to.length ? who.to : config.fallbackTo, off: who.off, ...mail });
    }
    return out;
  });
  let sent = 0;
  for (const item of claimed) {
    if (item.off || !item.to.length) {
      await tenantTx(tenantId, (c) => c.query("UPDATE notification_outbox SET sent_at = now(), last_error = $3 WHERE tenant_id = $1 AND id = $2", [tenantId, item.id, item.off ? "notifications_off" : "no_recipients"]));
      continue;
    }
    try {
      const response = await fetcher("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `lead-${item.id}` },
        body: JSON.stringify({ from: config.from, to: item.to, subject: item.subject, text: item.text }),
        signal: AbortSignal.timeout(10_000), redirect: "error",
      });
      if (!response.ok) throw new Error(`provider ${response.status}`);
      await tenantTx(tenantId, (c) => c.query("UPDATE notification_outbox SET sent_at = now(), last_error = NULL WHERE tenant_id = $1 AND id = $2 AND sent_at IS NULL", [tenantId, item.id]));
      sent += 1;
    } catch {
      await tenantTx(tenantId, (c) => c.query("UPDATE notification_outbox SET last_error = 'delivery_failed', available_at = now() + ($3::int * interval '1 minute') WHERE tenant_id = $1 AND id = $2 AND sent_at IS NULL", [tenantId, item.id, Math.min(60, 2 ** item.attempts)]));
    }
  }
  return { configured: true, sent };
}
