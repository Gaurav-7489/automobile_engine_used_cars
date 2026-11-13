import { createHash, randomUUID } from "node:crypto";
import type { SqlClient } from "./db";

/**
 * Customer conversations with the dealership: every message from the customer, the AI agent and the team, kept per dealership
 * and linked to the lead it produced. This is the log the team and management read; nothing is answered off the record.
 */
export type Channel = "website" | "whatsapp" | "instagram";
export type ConversationStatus = "ai" | "team" | "closed";
export type ConvMessage = { id: string; at: string; from: "customer" | "ai" | "team"; text: string; by?: string };
export type Conversation = {
  id: string; channel: Channel; contactName: string; contactPhone: string; contactRef: string; vehicleStockId: string | null; leadId: string | null;
  status: ConversationStatus; messages: ConvMessage[]; unread: boolean; createdAt: string; updatedAt: string;
};

export const CHANNELS: Channel[] = ["website", "whatsapp", "instagram"];
export const CHANNEL_LABEL: Record<Channel, string> = { website: "Website chat", whatsapp: "WhatsApp", instagram: "Instagram" };
export const MAX_KEPT_MESSAGES = 200;
export const contactKey = (channel: Channel, raw: string) => createHash("sha256").update(`${channel}:${raw}`).digest("hex");
export const cleanText = (s: unknown, max = 1000) => (typeof s === "string" ? s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");

const toConversation = (r: Record<string, unknown>): Conversation => ({
  id: String(r.conversation_id), channel: r.channel as Channel, contactName: String(r.contact_name ?? ""), contactPhone: String(r.contact_phone ?? ""), contactRef: String(r.contact_ref ?? ""),
  vehicleStockId: r.vehicle_stock_id ? String(r.vehicle_stock_id) : null, leadId: r.lead_id ? String(r.lead_id) : null, status: r.status as ConversationStatus,
  messages: (r.messages as ConvMessage[]) ?? [], unread: Boolean(r.unread), createdAt: new Date(String(r.created_at)).toISOString(), updatedAt: new Date(String(r.updated_at)).toISOString(),
});

export async function findConversation(c: SqlClient, tenantId: string, id: string): Promise<Conversation | null> {
  const row = (await c.query("SELECT * FROM intelligence_conversations WHERE tenant_id = $1 AND conversation_id = $2", [tenantId, id])).rows[0];
  return row ? toConversation(row as Record<string, unknown>) : null;
}

/** The customer's current conversation on a channel; a new one starts after a week of silence or once the team closed it. */
export async function openConversation(c: SqlClient, tenantId: string, input: { channel: Channel; key: string; ref?: string; name?: string; phone?: string; stock?: string | null }): Promise<Conversation> {
  const existing = (await c.query(
    "SELECT * FROM intelligence_conversations WHERE tenant_id = $1 AND channel = $2 AND contact_key = $3 AND status <> 'closed' AND updated_at > now() - interval '7 days' ORDER BY updated_at DESC LIMIT 1 FOR UPDATE",
    [tenantId, input.channel, input.key])).rows[0] as Record<string, unknown> | undefined;
  if (existing) {
    const conv = toConversation(existing);
    const name = conv.contactName || input.name || "";
    const stock = input.stock ?? conv.vehicleStockId;
    if (name !== conv.contactName || stock !== conv.vehicleStockId) {
      await c.query("UPDATE intelligence_conversations SET contact_name = $3, vehicle_stock_id = $4 WHERE tenant_id = $1 AND conversation_id = $2", [tenantId, conv.id, name, stock]);
    }
    return { ...conv, contactName: name, vehicleStockId: stock };
  }
  const id = `C-${randomUUID().slice(0, 8).toUpperCase()}`;
  const row = (await c.query(
    "INSERT INTO intelligence_conversations(tenant_id, conversation_id, channel, contact_key, contact_ref, contact_name, contact_phone, vehicle_stock_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
    [tenantId, id, input.channel, input.key, input.ref ?? "", input.name ?? "", input.phone ?? "", input.stock ?? null])).rows[0] as Record<string, unknown>;
  return toConversation(row);
}

export type ConversationPatch = { status?: ConversationStatus; leadId?: string; unread?: boolean; name?: string; phone?: string };

/** Appends messages (keeping the most recent 200) and applies any status, lead or contact change in the same statement. */
export async function appendMessages(c: SqlClient, tenantId: string, id: string, messages: Omit<ConvMessage, "id" | "at">[], patch: ConversationPatch = {}): Promise<ConvMessage[]> {
  const stamp = new Date().toISOString();
  const added: ConvMessage[] = messages.filter((m) => m.text.trim()).map((m) => ({ ...m, id: randomUUID().slice(0, 12), at: stamp }));
  await c.query(
    `UPDATE intelligence_conversations SET
       messages = (SELECT coalesce(jsonb_agg(x ORDER BY n), '[]'::jsonb) FROM (SELECT x, n FROM jsonb_array_elements(messages || $3::jsonb) WITH ORDINALITY AS t(x, n) ORDER BY n DESC LIMIT ${MAX_KEPT_MESSAGES}) kept),
       status = coalesce($4, status), lead_id = coalesce($5, lead_id), unread = coalesce($6, unread),
       contact_name = CASE WHEN coalesce($7, '') <> '' THEN $7 ELSE contact_name END,
       contact_phone = CASE WHEN coalesce($8, '') <> '' THEN $8 ELSE contact_phone END,
       updated_at = now()
     WHERE tenant_id = $1 AND conversation_id = $2`,
    [tenantId, id, JSON.stringify(added), patch.status ?? null, patch.leadId ?? null, patch.unread ?? null, patch.name ?? null, patch.phone ?? null]);
  return added;
}

export async function listConversations(c: SqlClient, tenantId: string, opts: { status?: ConversationStatus | "all"; leadId?: string; limit?: number } = {}): Promise<Conversation[]> {
  const values: unknown[] = [tenantId];
  const where = ["tenant_id = $1"];
  if (opts.status && opts.status !== "all") { values.push(opts.status); where.push(`status = $${values.length}`); }
  if (opts.leadId) { values.push(opts.leadId); where.push(`lead_id = $${values.length}`); }
  const rows = (await c.query(`SELECT * FROM intelligence_conversations WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT ${Math.min(200, opts.limit ?? 100)}`, values)).rows as Record<string, unknown>[];
  return rows.map(toConversation);
}
