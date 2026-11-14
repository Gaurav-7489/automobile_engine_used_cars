import { createHash } from "node:crypto";
import { can } from "../permissions";
import { tenantTx } from "./db";
import { resolvePrincipal, signIn } from "./identity";
import { writeAudit } from "./workspace-audit";

/**
 * Connecting a dealership's own website (a VandLabs website template) to its workspace.
 *
 * The owner signs in with their Intelligence email and password on the website's private /connect page. The website's
 * server sends those here together with a key it derived from its own deployment secret. Nothing is copied or pasted and
 * the website stores nothing: it can always re-derive the key, and this workspace only ever holds the key's SHA-256.
 *
 * A connection is an ordinary read-only API key (scope inventory:read) named "Website: <host>", so it appears under
 * Settings, API, expires after a year, records when it was last used, and is revoked there like any other key.
 */

const KEY = /^vl_([A-Za-z0-9_-]{12})_[A-Za-z0-9_-]{43}$/;
const NAME_PREFIX = "Website: ";
const DAYS = 365;
const hash = (key: string) => createHash("sha256").update(key).digest("hex");
type Row = Record<string, unknown>;

export type WebsiteConnectInput = { email: string; password: string; code?: string; key: string; siteUrl: string };
export type WebsiteConnectResult =
  | { ok: true; tenantId: string; dealership: string; site: string; expiresAt: string }
  | { ok: false; status: 401 | 403 | 409 | 422 | 428 | 429; code: string; message: string };

/** The website's public host, or null when the address is not a plain http(s) origin. */
export function siteHost(siteUrl: string): string | null {
  try {
    const url = new URL(siteUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || url.host.length > 80) return null;
    return url.host.toLowerCase();
  } catch {
    return null;
  }
}

async function ownerOf(input: Pick<WebsiteConnectInput, "email" | "password" | "code">) {
  const result = await signIn(input.email, input.password, input.code);
  if (!result.ok) {
    if (result.code === "locked") return { ok: false as const, status: 429 as const, code: "locked", message: "This account is temporarily locked after repeated failed attempts. Try again in 15 minutes." };
    if (result.code === "mfa_required") return { ok: false as const, status: 428 as const, code: "mfa_required", message: "Enter the 6-digit code from your authenticator app." };
    if (result.code === "mfa_invalid") return { ok: false as const, status: 401 as const, code: "mfa_invalid", message: "That code is not correct or has expired. Enter the latest code." };
    if (result.code === "no_access") return { ok: false as const, status: 403 as const, code: "no_access", message: "Your account is not a member of any workspace." };
    return { ok: false as const, status: 401 as const, code: "invalid_credentials", message: "Email or password is not correct. Check both and try again." };
  }
  const principal = await resolvePrincipal(result.userId, result.tenantId, Math.floor(Date.now() / 1000));
  if (!principal || !can(principal.role, "settings.keys")) return { ok: false as const, status: 403 as const, code: "forbidden", message: "Only the workspace owner can connect a website." };
  return { ok: true as const, principal };
}

/** Links the website to the signed-in owner's workspace. Connecting the same website again renews the same connection. */
export async function connectWebsite(input: WebsiteConnectInput): Promise<WebsiteConnectResult> {
  const match = KEY.exec(input.key);
  const site = siteHost(input.siteUrl);
  if (!match || !site) return { ok: false, status: 422, code: "invalid", message: "The website sent an incomplete connection request. Check its setup and try again." };
  const owner = await ownerOf(input);
  if (!owner.ok) return owner;
  const p = owner.principal;
  const prefix = match[1];
  const expires = new Date(Date.now() + DAYS * 86_400_000).toISOString();
  try {
    return await tenantTx(p.tenantId, async (c) => {
      // Row-level security shows only this workspace's keys, so a prefix held by another workspace is invisible here and the insert below hits the unique index.
      const existing = (await c.query("SELECT id FROM intelligence_api_keys WHERE tenant_id=$1 AND prefix=$2", [p.tenantId, prefix])).rows[0] as Row | undefined;
      if (existing) {
        await c.query("UPDATE intelligence_api_keys SET name=$3, key_hash=$4, location_ids=$5, created_by=$6, expires_at=$7, revoked_at=NULL WHERE tenant_id=$1 AND id=$2",
          [p.tenantId, existing.id, NAME_PREFIX + site, hash(input.key), JSON.stringify(p.locationIds), p.name || p.email, expires]);
      } else {
        await c.query("INSERT INTO intelligence_api_keys(tenant_id,name,scope,location_ids,prefix,key_hash,created_by,expires_at) VALUES($1,$2,'inventory:read',$3,$4,$5,$6,$7)",
          [p.tenantId, NAME_PREFIX + site, JSON.stringify(p.locationIds), prefix, hash(input.key), p.name || p.email, expires]);
      }
      await writeAudit(c, p.tenantId, p.name, "website.connected", site, existing ? "Website connection renewed" : "Website connected; published stock and enquiries now sync");
      return { ok: true as const, tenantId: p.tenantId, dealership: await dealershipName(c, p.tenantId), site, expiresAt: expires };
    });
  } catch (error) {
    if (/unique|duplicate/i.test(error instanceof Error ? error.message : "")) return { ok: false, status: 409, code: "conflict", message: "This website is already connected to another workspace. Disconnect it there first." };
    throw error;
  }
}

/** Ends the link. Only an owner of the workspace the website is connected to can do this. */
export async function disconnectWebsite(input: Omit<WebsiteConnectInput, "siteUrl">): Promise<{ ok: true; disconnected: boolean } | Extract<WebsiteConnectResult, { ok: false }>> {
  const match = KEY.exec(input.key);
  if (!match) return { ok: false, status: 422, code: "invalid", message: "The website sent an incomplete request." };
  const owner = await ownerOf(input);
  if (!owner.ok) return owner;
  const p = owner.principal;
  return tenantTx(p.tenantId, async (c) => {
    const row = (await c.query("UPDATE intelligence_api_keys SET revoked_at = now() WHERE tenant_id=$1 AND prefix=$2 AND revoked_at IS NULL RETURNING name", [p.tenantId, match[1]])).rows[0] as Row | undefined;
    if (row) await writeAudit(c, p.tenantId, p.name, "website.disconnected", String(row.name).replace(NAME_PREFIX, ""), "Website disconnected; it no longer reads stock from this workspace");
    return { ok: true as const, disconnected: !!row };
  });
}

async function dealershipName(c: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> }, tenantId: string): Promise<string> {
  const org = (await c.query("SELECT name FROM organizations WHERE tenant_id = $1 ORDER BY created_at LIMIT 1", [tenantId])).rows[0] as Row | undefined;
  const meta = (await c.query("SELECT payload FROM intelligence_documents WHERE tenant_id = $1 AND collection = 'meta' AND id = 'workspace'", [tenantId])).rows[0] as Row | undefined;
  return String((((meta?.payload as Row | undefined)?.profile ?? {}) as Row).displayName ?? org?.name ?? "").trim();
}

/** What a connected website asks on each refresh: which workspace it belongs to. */
export async function websiteInfo(tenantId: string, keyId: string): Promise<{ tenantId: string; dealership: string; site: string; expiresAt: string | null }> {
  return tenantTx(tenantId, async (c) => {
    const key = (await c.query("SELECT name, expires_at FROM intelligence_api_keys WHERE tenant_id=$1 AND id=$2", [tenantId, keyId])).rows[0] as Row | undefined;
    const name = String(key?.name ?? "");
    return { tenantId, dealership: await dealershipName(c, tenantId), site: name.startsWith(NAME_PREFIX) ? name.slice(NAME_PREFIX.length) : "", expiresAt: key?.expires_at ? new Date(String(key.expires_at)).toISOString() : null };
  });
}

export const isWebsiteKeyName = (name: string) => name.startsWith(NAME_PREFIX);
export const websiteOf = (name: string) => name.slice(NAME_PREFIX.length);
