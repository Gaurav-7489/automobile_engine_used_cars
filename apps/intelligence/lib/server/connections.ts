import { adAccountStatus, canManageAds, metaBase, providerConfigured, readConnections } from "./ad-accounts";
import { readChannels, saveChannel } from "./channels";
import { tenantTx } from "./db";
import type { Principal } from "./identity";
import { writeAudit } from "./workspace-audit";

/**
 * The five places a dealership promotes its cars, as the Advertising page shows them. Each is connected once, on the
 * provider's own consent screen, and nothing is typed or pasted:
 *   Facebook and Instagram: one Facebook login (ad account, Page, and the Page's Instagram account).
 *   WhatsApp: the same Meta app with WhatsApp permissions; the business number becomes the AI agent's WhatsApp inbox.
 *   Google Ads and YouTube: one Google login (Google Ads account, and the YouTube channel on that login).
 */
export type PlatformId = "instagram" | "facebook" | "whatsapp" | "google" | "youtube";
export type PlatformStatus = {
  id: PlatformId; name: string; does: string;
  /** Which login connects it: two cards can share one (Facebook and Instagram; Google Ads and YouTube). */
  via: "meta" | "whatsapp" | "google"; viaName: string;
  available: boolean; connected: boolean; needsReconnect: boolean;
  account: string; problem: string;
  accounts?: { id: string; name: string }[]; accountId?: string;
};

const env = (name: string) => process.env[name]?.trim() ?? "";

async function getJson(url: string, token: string): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(12_000) });
  return { ok: response.ok, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
}

type WaNumber = { id: string; display: string; name: string; wabaId: string };

/** Every WhatsApp Business number the login can manage, across the businesses it belongs to. */
async function whatsappNumbers(token: string): Promise<WaNumber[]> {
  const fields = "id,name,owned_whatsapp_business_accounts{id,phone_numbers{id,display_phone_number,verified_name}},client_whatsapp_business_accounts{id,phone_numbers{id,display_phone_number,verified_name}}";
  const r = await getJson(`${metaBase()}/me/businesses?fields=${encodeURIComponent(fields)}&limit=25`, token);
  const out: WaNumber[] = [];
  for (const business of (Array.isArray(r.body.data) ? r.body.data : []) as Record<string, unknown>[]) {
    for (const key of ["owned_whatsapp_business_accounts", "client_whatsapp_business_accounts"]) {
      for (const waba of ((business[key] as { data?: unknown[] } | undefined)?.data ?? []) as Record<string, unknown>[]) {
        for (const phone of ((waba.phone_numbers as { data?: unknown[] } | undefined)?.data ?? []) as Record<string, unknown>[]) {
          if (typeof phone.id === "string") out.push({ id: phone.id, display: String(phone.display_phone_number ?? ""), name: String(phone.verified_name ?? ""), wabaId: String(waba.id) });
        }
      }
    }
  }
  return out;
}

/**
 * Finishes connecting WhatsApp: exchanges the code for a long-lived token, finds the business number, subscribes the app to its
 * messages (so customer replies reach the inbox) and saves it as the WhatsApp channel, checked with Meta before it is stored.
 */
export async function completeWhatsApp(principal: Principal, code: string, redirectUri: string): Promise<{ ok: true; accountName: string } | { ok: false; message: string }> {
  if (!canManageAds(principal)) return { ok: false, message: "Only an owner or manager can connect WhatsApp." };
  if (!providerConfigured("whatsapp")) return { ok: false, message: "This connection is not set up for this workspace yet." };
  const app = { client_id: env("META_APP_ID"), client_secret: env("META_APP_SECRET") };
  const short = await fetch(`${metaBase()}/oauth/access_token?${new URLSearchParams({ ...app, redirect_uri: redirectUri, code })}`, { cache: "no-store", signal: AbortSignal.timeout(12_000) }).then((r) => r.json()).catch(() => ({})) as Record<string, unknown>;
  if (typeof short.access_token !== "string") return { ok: false, message: "Facebook did not complete the WhatsApp connection. Try again." };
  const long = await fetch(`${metaBase()}/oauth/access_token?${new URLSearchParams({ ...app, grant_type: "fb_exchange_token", fb_exchange_token: short.access_token })}`, { cache: "no-store", signal: AbortSignal.timeout(12_000) }).then((r) => r.json()).catch(() => ({})) as Record<string, unknown>;
  const token = typeof long.access_token === "string" ? long.access_token : short.access_token;
  const numbers = await whatsappNumbers(token);
  if (!numbers.length) return { ok: false, message: "That login has no WhatsApp Business number. Add one in Meta Business Suite (WhatsApp accounts), then connect again." };
  const number = numbers[0];
  // Without this subscription Meta does not send the number's incoming messages to VandLabs.
  await fetch(`${metaBase()}/${encodeURIComponent(number.wabaId)}/subscribed_apps`, { method: "POST", headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(12_000) }).catch(() => undefined);
  const saved = await saveChannel(principal, { channel: "whatsapp", enabled: true, externalId: number.id, token });
  if (!saved.ok) return saved;
  return { ok: true, accountName: [number.name, number.display].filter(Boolean).join(" ") || "WhatsApp Business" };
}

/** Disconnecting deletes the stored token and switches the WhatsApp inbox off. */
export async function disconnectWhatsApp(principal: Principal): Promise<boolean> {
  if (!canManageAds(principal)) return false;
  return tenantTx(principal.tenantId, async (c) => {
    const removed = (await c.query("DELETE FROM intelligence_ai_channels WHERE tenant_id = $1 AND channel = 'whatsapp' RETURNING channel", [principal.tenantId])).rows.length > 0;
    if (removed) await writeAudit(c, principal.tenantId, principal.name, "messaging.channel_off", "whatsapp", "WhatsApp disconnected; stored token deleted");
    return removed;
  });
}

/** The five cards, from the stored connections. No tokens leave the server. */
export async function platformStatus(principal: Principal): Promise<PlatformStatus[]> {
  const [ads, rows, channels] = await Promise.all([
    adAccountStatus(principal),
    tenantTx(principal.tenantId, (c) => readConnections(c, principal.tenantId)),
    tenantTx(principal.tenantId, (c) => readChannels(c, principal.tenantId)),
  ]);
  const meta = ads.find((a) => a.provider === "meta")!;
  const google = ads.find((a) => a.provider === "google")!;
  const metaDetails = rows.find((r) => r.provider === "meta")?.details;
  const googleDetails = rows.find((r) => r.provider === "google")?.details;
  const whatsapp = channels.find((c) => c.channel === "whatsapp");
  const page = metaDetails?.pages?.find((p) => p.id === metaDetails.pageId);
  const base = (id: PlatformId, name: string, does: string, via: PlatformStatus["via"], viaName: string): PlatformStatus => ({
    id, name, does, via, viaName, available: providerConfigured(via), connected: false, needsReconnect: false, account: "", problem: "",
  });
  return [
    { ...base("instagram", "Instagram", "Photo ads in feeds, Stories and Reels", "meta", "Facebook login"),
      connected: meta.connected && Boolean(metaDetails?.instagramId), needsReconnect: meta.needsReconnect,
      account: metaDetails?.instagramUsername ? `@${metaDetails.instagramUsername}` : metaDetails?.instagramId ? "Instagram business account" : "",
      problem: meta.connected && !metaDetails?.instagramId ? "Your Facebook Page has no Instagram business account linked. Link one in Meta Business Suite, then reconnect." : "" },
    { ...base("facebook", "Facebook", "Photo ads in the feed and Marketplace", "meta", "Facebook login"),
      connected: meta.connected, needsReconnect: meta.needsReconnect, account: [page?.name, meta.accountName].filter(Boolean).join(" · "), accounts: meta.accounts, accountId: meta.accountId },
    { ...base("whatsapp", "WhatsApp", "Customers message you; the AI agent replies", "whatsapp", "WhatsApp Business login"),
      connected: Boolean(whatsapp?.configured && whatsapp.enabled), account: whatsapp?.displayName ?? "" },
    { ...base("google", "Google Ads", "Search ads when people look for this car", "google", "Google login"),
      connected: google.connected, account: google.accountName, accounts: google.accounts, accountId: google.accountId },
    { ...base("youtube", "YouTube", "Video ads, run from your Google Ads account", "google", "Google login"),
      connected: google.connected && Boolean(googleDetails?.youtube), account: googleDetails?.youtube?.title ?? "",
      problem: google.connected && !googleDetails?.youtube ? "No YouTube channel on that Google login. Create one, then reconnect Google." : "" },
  ];
}
