import type { Integration } from "../domain";
import { buildProductionState } from "../state";
import { tenantTx, type SqlClient } from "./db";
import { exchangeGoogleCode, googleAuthUrl, googleConfigured, refreshGoogleToken } from "./google-oauth";
import type { Principal } from "./identity";
import { open, seal } from "./secret-box";

/**
 * Advertising accounts a dealership connects itself, through the provider's own consent screen:
 *   google: a Google Ads account (Search ads).
 *   meta:   a Meta ad account with a Facebook Page and, when the Page has one, its Instagram account (Facebook and Instagram ads).
 * Tokens are encrypted before they are stored and never leave the server. Nothing is "connected" until the provider has
 * returned a working token and at least one ad account.
 */
export type AdProvider = "google" | "meta";
export const AD_PROVIDERS: { id: AdProvider; name: string; covers: string }[] = [
  { id: "google", name: "Google Ads", covers: "Google Search ads" },
  { id: "meta", name: "Facebook and Instagram", covers: "Ads on Facebook and Instagram" },
];
export const isAdProvider = (v: unknown): v is AdProvider => v === "google" || v === "meta";

/** API versions are configurable because both providers retire versions on their own schedule. */
export const googleAdsBase = () => `https://googleads.googleapis.com/${process.env.GOOGLE_ADS_API_VERSION?.trim() || "v23"}`;
export const metaBase = () => `https://graph.facebook.com/${process.env.META_API_VERSION?.trim() || "v24.0"}`;

const env = (name: string) => process.env[name]?.trim() ?? "";
export function providerConfigured(provider: AdProvider): boolean {
  return provider === "google" ? googleConfigured() && Boolean(env("GOOGLE_ADS_DEVELOPER_TOKEN")) : Boolean(env("META_APP_ID") && env("META_APP_SECRET"));
}

const META_SCOPES = "ads_management,ads_read,pages_show_list,pages_read_engagement,business_management,instagram_basic";

export function adAuthUrl(provider: AdProvider, redirectUri: string, state: string): string {
  if (provider === "google") return googleAuthUrl({ redirectUri, state, scope: "https://www.googleapis.com/auth/adwords", offline: true });
  const p = new URLSearchParams({ client_id: env("META_APP_ID"), redirect_uri: redirectUri, state, response_type: "code", scope: META_SCOPES });
  return `https://www.facebook.com/${process.env.META_API_VERSION?.trim() || "v24.0"}/dialog/oauth?${p.toString()}`;
}

export type AdAccountChoice = { id: string; name: string };
export type MetaPage = { id: string; name: string; instagramId: string | null };
export type AdDetails = { accounts: AdAccountChoice[]; pages?: MetaPage[]; pageId?: string; instagramId?: string | null };
export type AdConnection = { provider: AdProvider; accountId: string; accountName: string; details: AdDetails; connectedAt: string; expiresAt: string | null };

type Fetched = { ok: true; access: string; refresh: string | null; expiresAt: string | null; accounts: AdAccountChoice[]; details: Partial<AdDetails> } | { ok: false; message: string };

const getJson = async (url: string, headers: Record<string, string> = {}): Promise<{ status: number; body: Record<string, unknown> }> => {
  const response = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(12_000) });
  return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
};

export const googleAdsHeaders = (access: string, loginCustomerId?: string): Record<string, string> => ({
  authorization: `Bearer ${access}`, "developer-token": env("GOOGLE_ADS_DEVELOPER_TOKEN"), "content-type": "application/json",
  ...(env("GOOGLE_ADS_LOGIN_CUSTOMER_ID") || loginCustomerId ? { "login-customer-id": env("GOOGLE_ADS_LOGIN_CUSTOMER_ID") || loginCustomerId! } : {}),
});

async function fetchGoogle(code: string, redirectUri: string): Promise<Fetched> {
  const tokens = await exchangeGoogleCode(code, redirectUri);
  if (!tokens?.access_token) return { ok: false, message: "Google did not complete the connection. Try again." };
  if (!tokens.refresh_token) return { ok: false, message: "Google did not grant ongoing access. Remove VandLabs from your Google account's third-party access, then connect again." };
  const list = await getJson(`${googleAdsBase()}/customers:listAccessibleCustomers`, googleAdsHeaders(tokens.access_token));
  const names = Array.isArray(list.body.resourceNames) ? (list.body.resourceNames as unknown[]).filter((n): n is string => typeof n === "string") : [];
  if (list.status !== 200 || !names.length) return { ok: false, message: list.status === 200 ? "That Google login has no Google Ads account. Create one at ads.google.com, then connect again." : "Google Ads refused the request. The VandLabs developer token may not be approved for live accounts yet." };
  const accounts = names.map((n) => n.replace("customers/", "")).filter((id) => /^\d{6,12}$/.test(id)).slice(0, 20).map((id) => ({ id, name: `Google Ads ${id.replace(/(\d{3})(\d{3})(\d+)/, "$1-$2-$3")}` }));
  return { ok: true, access: tokens.access_token, refresh: tokens.refresh_token, expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(), accounts, details: {} };
}

async function fetchMeta(code: string, redirectUri: string): Promise<Fetched> {
  const app = { client_id: env("META_APP_ID"), client_secret: env("META_APP_SECRET") };
  const short = await getJson(`${metaBase()}/oauth/access_token?${new URLSearchParams({ ...app, redirect_uri: redirectUri, code })}`);
  if (typeof short.body.access_token !== "string") return { ok: false, message: "Facebook did not complete the connection. Try again." };
  // A short-lived token lasts about an hour; the long-lived exchange gives roughly sixty days.
  const long = await getJson(`${metaBase()}/oauth/access_token?${new URLSearchParams({ ...app, grant_type: "fb_exchange_token", fb_exchange_token: short.body.access_token })}`);
  const access = typeof long.body.access_token === "string" ? long.body.access_token : short.body.access_token;
  const seconds = typeof long.body.expires_in === "number" ? long.body.expires_in : 3600;
  const auth = { authorization: `Bearer ${access}` };
  const ads = await getJson(`${metaBase()}/me/adaccounts?fields=account_id,name&limit=50`, auth);
  const accounts = (Array.isArray(ads.body.data) ? (ads.body.data as Record<string, unknown>[]) : []).filter((a) => typeof a.id === "string").map((a) => ({ id: String(a.id), name: String(a.name || a.id) }));
  if (!accounts.length) return { ok: false, message: "That Facebook login has no ad account. Create one in Meta Business Suite, then connect again." };
  const pagesBody = await getJson(`${metaBase()}/me/accounts?fields=id,name,instagram_business_account{id}&limit=50`, auth);
  const pages: MetaPage[] = (Array.isArray(pagesBody.body.data) ? (pagesBody.body.data as Record<string, unknown>[]) : []).filter((p) => typeof p.id === "string")
    .map((p) => ({ id: String(p.id), name: String(p.name || p.id), instagramId: typeof (p.instagram_business_account as { id?: unknown } | undefined)?.id === "string" ? String((p.instagram_business_account as { id: string }).id) : null }));
  if (!pages.length) return { ok: false, message: "Ads need a Facebook Page for your dealership. Create a Page, then connect again." };
  const page = pages.find((p) => p.instagramId) ?? pages[0];
  return { ok: true, access, refresh: null, expiresAt: new Date(Date.now() + seconds * 1000).toISOString(), accounts, details: { pages, pageId: page.id, instagramId: page.instagramId } };
}

const ADMIN_ROLES = new Set(["owner", "manager"]);
export const canManageAds = (principal: Principal): boolean => ADMIN_ROLES.has(principal.role);

/** Finishes a connection: exchanges the code, confirms an ad account exists, stores the encrypted tokens and marks advertising connected. */
export async function completeConnection(principal: Principal, provider: AdProvider, code: string, redirectUri: string): Promise<{ ok: true; accountName: string } | { ok: false; message: string }> {
  if (!canManageAds(principal)) return { ok: false, message: "Only an owner or manager can connect an advertising account." };
  if (!providerConfigured(provider)) return { ok: false, message: "This connection is not set up for this workspace yet." };
  const fetched = provider === "google" ? await fetchGoogle(code, redirectUri) : await fetchMeta(code, redirectUri);
  if (!fetched.ok) return fetched;
  const accessCipher = await seal(fetched.access);
  const refreshCipher = fetched.refresh ? await seal(fetched.refresh) : null;
  if (!accessCipher || (fetched.refresh && !refreshCipher)) return { ok: false, message: "Tokens cannot be stored securely in this environment. Ask your administrator." };
  const account = fetched.accounts[0];
  const details: AdDetails = { ...fetched.details, accounts: fetched.accounts };
  await tenantTx(principal.tenantId, async (c) => {
    await c.query(
      `INSERT INTO intelligence_ad_connections(tenant_id, provider, account_id, account_name, details, access_cipher, refresh_cipher, expires_at, connected_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (tenant_id, provider) DO UPDATE SET account_id = EXCLUDED.account_id, account_name = EXCLUDED.account_name, details = EXCLUDED.details, access_cipher = EXCLUDED.access_cipher,
         refresh_cipher = EXCLUDED.refresh_cipher, expires_at = EXCLUDED.expires_at, connected_by = EXCLUDED.connected_by, connected_at = now(), updated_at = now()`,
      [principal.tenantId, provider, account.id, account.name, details, accessCipher, refreshCipher, fetched.expiresAt, principal.userId]);
    await syncAdsIntegration(c, principal, `${provider} connected`, account.name);
  });
  return { ok: true, accountName: account.name };
}

const toConnection = (r: Record<string, unknown>): AdConnection => ({
  provider: r.provider as AdProvider, accountId: String(r.account_id), accountName: String(r.account_name), details: (r.details ?? { accounts: [] }) as AdDetails,
  connectedAt: new Date(String(r.connected_at)).toISOString(), expiresAt: r.expires_at ? new Date(String(r.expires_at)).toISOString() : null,
});

export async function readConnections(c: SqlClient, tenantId: string): Promise<AdConnection[]> {
  return ((await c.query("SELECT provider, account_id, account_name, details, connected_at, expires_at FROM intelligence_ad_connections WHERE tenant_id = $1 ORDER BY provider", [tenantId])).rows as Record<string, unknown>[]).map(toConnection);
}

export type AdAccountStatus = { provider: AdProvider; name: string; covers: string; available: boolean; connected: boolean; accountId: string; accountName: string; accounts: AdAccountChoice[]; needsReconnect: boolean };

/** What the Advertising page shows: each provider, whether it can be connected here, and which account is in use. No tokens. */
export async function adAccountStatus(principal: Principal): Promise<AdAccountStatus[]> {
  const rows = await tenantTx(principal.tenantId, (c) => readConnections(c, principal.tenantId));
  return AD_PROVIDERS.map((p) => {
    const row = rows.find((r) => r.provider === p.id);
    // Meta tokens cannot be renewed silently: once the stored one has expired the owner must connect again.
    const needsReconnect = Boolean(row && p.id === "meta" && row.expiresAt && Date.parse(row.expiresAt) < Date.now());
    return { provider: p.id, name: p.name, covers: p.covers, available: providerConfigured(p.id), connected: Boolean(row), accountId: row?.accountId ?? "", accountName: row?.accountName ?? "", accounts: row?.details.accounts ?? [], needsReconnect };
  });
}

/** Switches to another ad account the same login can already use. */
export async function chooseAccount(principal: Principal, provider: AdProvider, accountId: string): Promise<boolean> {
  if (!canManageAds(principal)) return false;
  return tenantTx(principal.tenantId, async (c) => {
    const row = (await readConnections(c, principal.tenantId)).find((r) => r.provider === provider);
    const choice = row?.details.accounts.find((a) => a.id === accountId);
    if (!row || !choice) return false;
    await c.query("UPDATE intelligence_ad_connections SET account_id = $3, account_name = $4, updated_at = now() WHERE tenant_id = $1 AND provider = $2", [principal.tenantId, provider, choice.id, choice.name]);
    await syncAdsIntegration(c, principal, `${provider} account changed`, choice.name);
    return true;
  });
}

export async function disconnect(principal: Principal, provider: AdProvider): Promise<boolean> {
  if (!canManageAds(principal)) return false;
  return tenantTx(principal.tenantId, async (c) => {
    const removed = (await c.query("DELETE FROM intelligence_ad_connections WHERE tenant_id = $1 AND provider = $2 RETURNING provider", [principal.tenantId, provider])).rows.length > 0;
    if (removed) await syncAdsIntegration(c, principal, `${provider} disconnected`, "Stored tokens deleted");
    return removed;
  });
}

/** Keeps the workspace's "Advertising account" integration in step with the real connections, and records who changed it. */
async function syncAdsIntegration(c: SqlClient, principal: Principal, action: string, detail: string): Promise<void> {
  const rows = await readConnections(c, principal.tenantId);
  const stamp = new Date().toISOString();
  const base = buildProductionState().integrations.find((i) => i.id === "ads")!;
  const integration: Integration = rows.length
    ? { ...base, state: "Connected", providers: rows.map((r) => r.provider), lastSuccessAt: stamp, detail: `Connected: ${rows.map((r) => AD_PROVIDERS.find((p) => p.id === r.provider)!.name).join(" and ")}.` }
    : { ...base, providers: [] };
  const upsert = (collection: string, id: string, payload: unknown) => c.query(
    `INSERT INTO intelligence_documents(tenant_id, collection, id, payload, updated_at) VALUES($1,$2,$3,$4,$5)
     ON CONFLICT (tenant_id, collection, id) DO UPDATE SET payload = EXCLUDED.payload, version = intelligence_documents.version + 1, updated_at = EXCLUDED.updated_at`, [principal.tenantId, collection, id, payload, stamp]);
  await upsert("integrations", "ads", integration);
  const auditId = `AU-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  await upsert("audit", auditId, { id: auditId, at: stamp, actor: principal.name, action: `advertising.${action.replace(/\s+/g, "_")}`, target: "ads", detail });
}

export type AdAccess = { provider: AdProvider; token: string; accountId: string; details: AdDetails };

/** A usable access token for one provider, renewing Google's hourly token when it is close to expiry. Null when not connected or expired. */
export async function adAccess(tenantId: string, provider: AdProvider): Promise<AdAccess | null> {
  const row = (await tenantTx(tenantId, (c) => c.query("SELECT * FROM intelligence_ad_connections WHERE tenant_id = $1 AND provider = $2", [tenantId, provider]))).rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const base = { provider, accountId: String(row.account_id), details: (row.details ?? { accounts: [] }) as AdDetails };
  const fresh = row.expires_at ? new Date(String(row.expires_at)).getTime() - Date.now() > 120_000 : true;
  if (fresh) { const token = await open(String(row.access_cipher)); return token ? { ...base, token } : null; }
  if (provider !== "google") return null;
  const refresh = await open(row.refresh_cipher as string | null);
  const renewed = refresh ? await refreshGoogleToken(refresh) : null;
  if (!renewed?.access_token) return null;
  const cipher = await seal(renewed.access_token);
  if (cipher) await tenantTx(tenantId, (c) => c.query("UPDATE intelligence_ad_connections SET access_cipher = $3, expires_at = $4, updated_at = now() WHERE tenant_id = $1 AND provider = $2", [tenantId, provider, cipher, new Date(Date.now() + (renewed.expires_in ?? 3600) * 1000).toISOString()]));
  return { ...base, token: renewed.access_token };
}
