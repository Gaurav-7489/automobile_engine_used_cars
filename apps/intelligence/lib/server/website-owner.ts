import { createHash, randomBytes } from "node:crypto";
import { tenantTx } from "./db";
import { writeAudit } from "./workspace-audit";
import { siteHost, siteOrigin } from "./website-connect";
import type { Principal } from "./identity";
import { can } from "../permissions";

/**
 * A dealership owner links their own website to their workspace, signed in with Google and confirming the change (see the route).
 * The key is generated here, shown once and stored only as its SHA-256, exactly like an API key with the "website" scope. Every query runs
 * inside the owner's own workspace (row-level security), so an owner cannot see or change another dealership's links.
 */
const NAME_PREFIX = "Website: ";
const DAYS = 365;
type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);

export type OwnWebsite = { id: string; site: string; prefix: string; createdAt: string; expiresAt: string | null; lastUsedAt: string | null };

export async function ownWebsites(p: Principal): Promise<OwnWebsite[]> {
  if (!can(p.role, "settings.keys")) return [];
  return tenantTx(p.tenantId, async (c) => {
    const rows = (await c.query("SELECT id, name, prefix, created_at, expires_at, last_used_at FROM intelligence_api_keys WHERE tenant_id = $1 AND scope = 'website' AND revoked_at IS NULL ORDER BY created_at DESC", [p.tenantId])).rows as Row[];
    return rows.map((r) => ({ id: String(r.id), site: String(r.name).replace(NAME_PREFIX, ""), prefix: `vl_${String(r.prefix)}`, createdAt: iso(r.created_at)!, expiresAt: iso(r.expires_at), lastUsedAt: iso(r.last_used_at) }));
  });
}

export type LinkOutcome =
  | { ok: true; key: string; keyId: string; site: string; expiresAt: string }
  | { ok: false; status: 403 | 422; code: "forbidden" | "invalid"; message: string; fields?: Record<string, string> };

/** Links the website at `siteUrl`. Linking the same website again replaces its previous key, so each site has one live key. */
export async function linkOwnWebsite(p: Principal, siteUrl: string): Promise<LinkOutcome> {
  if (!can(p.role, "settings.keys")) return { ok: false, status: 403, code: "forbidden", message: "Only the workspace owner can link a website." };
  const host = siteHost(siteUrl);
  if (!host) return { ok: false, status: 422, code: "invalid", message: "Enter the website's address, for example https://www.dealer.example.", fields: { siteUrl: "Enter the full website address." } };
  const origin = siteOrigin(siteUrl);
  const prefix = randomBytes(9).toString("base64url");
  const key = `vl_${prefix}_${randomBytes(32).toString("base64url")}`;
  const expires = new Date(Date.now() + DAYS * 86_400_000).toISOString();
  return tenantTx(p.tenantId, async (c) => {
    const replaced = (await c.query("UPDATE intelligence_api_keys SET revoked_at = now() WHERE tenant_id = $1 AND name = $2 AND scope = 'website' AND revoked_at IS NULL RETURNING id", [p.tenantId, NAME_PREFIX + host])).rows.length;
    const inserted = (await c.query(
      "INSERT INTO intelligence_api_keys (tenant_id, name, scope, location_ids, prefix, key_hash, created_by, expires_at, site_origin) VALUES ($1, $2, 'website', $3, $4, $5, $6, $7, $8) RETURNING id",
      [p.tenantId, NAME_PREFIX + host, JSON.stringify(p.locationIds), prefix, createHash("sha256").update(key).digest("hex"), p.name || p.email, expires, origin])).rows[0] as Row;
    if (replaced) await writeAudit(c, p.tenantId, p.name || p.email, "website.key_replaced", host, `Previous website key revoked (${replaced})`);
    await writeAudit(c, p.tenantId, p.name || p.email, "website.linked", host, "Website linked by the owner; published stock and enquiries now sync");
    return { ok: true as const, key, keyId: String(inserted.id), site: host, expiresAt: expires };
  });
}

/** Ends a link in the owner's own workspace only. */
export async function unlinkOwnWebsite(p: Principal, keyId: string): Promise<boolean> {
  if (!can(p.role, "settings.keys")) return false;
  return tenantTx(p.tenantId, async (c) => {
    const row = (await c.query("UPDATE intelligence_api_keys SET revoked_at = now() WHERE tenant_id = $1 AND id = $2 AND scope = 'website' AND revoked_at IS NULL RETURNING name", [p.tenantId, keyId])).rows[0] as Row | undefined;
    if (row) await writeAudit(c, p.tenantId, p.name || p.email, "website.disconnected", String(row.name).replace(NAME_PREFIX, ""), "Website disconnected by the owner; it no longer reads stock from this workspace");
    return Boolean(row);
  });
}
