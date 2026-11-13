import { metaBase } from "./ad-accounts";
import { plain, tenantTx, type SqlClient } from "./db";
import type { Principal } from "./identity";
import { open, seal } from "./secret-box";
import { writeAudit } from "./workspace-audit";
import { CHANNEL_LABEL, CHANNELS, type Channel } from "./conversations";

/**
 * The customer messaging channels a dealership has configured for the AI agent. Nothing is on by default: the website chat
 * appears on the dealer's public car pages only when switched on, and WhatsApp and Instagram need the dealership's own
 * account details, checked with the provider before they are saved. Tokens are encrypted at rest.
 */
export type ChannelState = { channel: Channel; label: string; enabled: boolean; externalId: string; displayName: string; configured: boolean; updatedAt: string | null };

const MANAGERS = new Set(["owner", "manager"]);
export const canManageChannels = (p: Principal) => MANAGERS.has(p.role);

export async function readChannels(c: SqlClient, tenantId: string): Promise<ChannelState[]> {
  const rows = (await c.query("SELECT channel, enabled, external_id, display_name, token_cipher IS NOT NULL AS has_token, updated_at FROM intelligence_ai_channels WHERE tenant_id = $1", [tenantId])).rows as Record<string, unknown>[];
  return CHANNELS.map((channel) => {
    const r = rows.find((x) => x.channel === channel);
    return {
      channel, label: CHANNEL_LABEL[channel], enabled: Boolean(r?.enabled), externalId: String(r?.external_id ?? ""), displayName: String(r?.display_name ?? ""),
      configured: channel === "website" ? true : Boolean(r?.external_id && r?.has_token), updatedAt: r?.updated_at ? new Date(String(r.updated_at)).toISOString() : null,
    };
  });
}

/** Whether a dealership's public pages show the chat. Public: answers only yes or no. */
export async function websiteChatEnabled(tenantId: string): Promise<boolean> {
  try {
    return await tenantTx(tenantId, async (c) => Boolean((await c.query("SELECT enabled FROM intelligence_ai_channels WHERE tenant_id = $1 AND channel = 'website'", [tenantId])).rows[0]?.enabled));
  } catch {
    return false;
  }
}

export async function tenantForChannel(channel: "whatsapp" | "instagram", externalId: string): Promise<string | null> {
  const row = (await plain((c) => c.query("SELECT intelligence_ai_channel_tenant($1, $2) AS t", [channel, externalId]))).rows[0] as { t: string | null } | undefined;
  return row?.t ?? null;
}

type Check = { ok: true; displayName: string } | { ok: false; message: string };

async function getJson(url: string, token: string): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  return { ok: response.ok, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
}

/** Asks the provider whether these details work before anything is saved, so a channel is never shown as set up when it is not. */
export async function checkChannel(channel: "whatsapp" | "instagram", externalId: string, token: string): Promise<Check> {
  try {
    if (channel === "whatsapp") {
      const r = await getJson(`${metaBase()}/${encodeURIComponent(externalId)}?fields=display_phone_number,verified_name`, token);
      return r.ok && typeof r.body.display_phone_number === "string" ? { ok: true, displayName: `${r.body.verified_name ?? ""} ${r.body.display_phone_number}`.trim() } : { ok: false, message: "WhatsApp did not accept that phone number ID and token." };
    }
    const r = await getJson(`${metaBase()}/${encodeURIComponent(externalId)}?fields=username`, token);
    return r.ok && typeof r.body.username === "string" ? { ok: true, displayName: `@${r.body.username}` } : { ok: false, message: "Instagram did not accept that account ID and token." };
  } catch {
    return { ok: false, message: "The provider could not be reached. Try again." };
  }
}

export type ChannelUpdate = { channel: Channel; enabled: boolean; externalId?: string; token?: string };

export async function saveChannel(principal: Principal, update: ChannelUpdate): Promise<{ ok: true; channels: ChannelState[] } | { ok: false; message: string }> {
  if (!canManageChannels(principal)) return { ok: false, message: "Only an owner or manager can change customer messaging." };
  let externalId = "", displayName = "", cipher: string | null = null;
  if (update.channel !== "website") {
    const current = (await tenantTx(principal.tenantId, (c) => c.query("SELECT external_id, token_cipher, display_name FROM intelligence_ai_channels WHERE tenant_id = $1 AND channel = $2", [principal.tenantId, update.channel]))).rows[0] as Record<string, unknown> | undefined;
    externalId = (update.externalId ?? String(current?.external_id ?? "")).trim();
    const token = update.token?.trim() || (await open(current?.token_cipher as string | null)) || "";
    if (update.enabled) {
      if (!/^\d{5,30}$/.test(externalId) || !token) return { ok: false, message: update.channel === "whatsapp" ? "Enter the WhatsApp phone number ID and access token." : "Enter the Instagram account ID and access token." };
      const check = await checkChannel(update.channel, externalId, token);
      if (!check.ok) return check;
      displayName = check.displayName;
    } else displayName = String(current?.display_name ?? "");
    cipher = token ? await seal(token) : null;
    if (token && !cipher) return { ok: false, message: "Tokens cannot be stored securely in this environment. Ask your administrator." };
  }
  try {
    return await tenantTx(principal.tenantId, async (c) => {
      await c.query(
        `INSERT INTO intelligence_ai_channels(tenant_id, channel, enabled, external_id, display_name, token_cipher, updated_by, updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,now())
         ON CONFLICT (tenant_id, channel) DO UPDATE SET enabled = EXCLUDED.enabled, external_id = EXCLUDED.external_id, display_name = EXCLUDED.display_name,
           token_cipher = coalesce(EXCLUDED.token_cipher, intelligence_ai_channels.token_cipher), updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [principal.tenantId, update.channel, update.enabled, externalId, displayName, cipher, principal.userId]);
      await writeAudit(c, principal.tenantId, principal.name, update.enabled ? "messaging.channel_on" : "messaging.channel_off", update.channel, `${CHANNEL_LABEL[update.channel]}${displayName ? ` (${displayName})` : ""}`);
      return { ok: true as const, channels: await readChannels(c, principal.tenantId) };
    });
  } catch (error) {
    if (error instanceof Error && /unique|duplicate/i.test(error.message)) return { ok: false, message: "That account is already connected to another dealership on VandLabs." };
    throw error;
  }
}

async function channelToken(tenantId: string, channel: "whatsapp" | "instagram"): Promise<{ externalId: string; token: string } | null> {
  const row = (await tenantTx(tenantId, (c) => c.query("SELECT external_id, token_cipher FROM intelligence_ai_channels WHERE tenant_id = $1 AND channel = $2 AND enabled", [tenantId, channel]))).rows[0] as Record<string, unknown> | undefined;
  const token = row ? await open(row.token_cipher as string | null) : null;
  return row && token ? { externalId: String(row.external_id), token } : null;
}

/** Sends a text reply on WhatsApp or Instagram. The website chat needs no send: the customer's page reads the conversation. */
export async function sendOnChannel(tenantId: string, channel: Channel, to: string, text: string): Promise<boolean> {
  if (channel === "website" || !to) return true;
  const access = await channelToken(tenantId, channel);
  if (!access) return false;
  const body = channel === "whatsapp"
    ? { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body: text.slice(0, 4000), preview_url: true } }
    : { recipient: { id: to }, message: { text: text.slice(0, 1000) } };
  const url = channel === "whatsapp" ? `${metaBase()}/${access.externalId}/messages` : `${metaBase()}/me/messages`;
  try {
    const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${access.token}`, "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok) console.error(JSON.stringify({ event: "channel_send_failure", channel, status: response.status }));
    return response.ok;
  } catch {
    return false;
  }
}
