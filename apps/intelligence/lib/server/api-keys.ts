import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { plain, tenantTx } from "./db";
import type { Principal } from "./identity";

export const API_SCOPES = ["inventory:read", "leads:read"] as const;
export type ApiScope = (typeof API_SCOPES)[number];
export type ApiKeyView = { id: string; name: string; scope: ApiScope; prefix: string; createdBy: string; createdAt: string; expiresAt: string; revokedAt: string | null; lastUsedAt: string | null };

const hash = (key: string) => createHash("sha256").update(key).digest("hex");
type Row = Record<string, unknown>;
const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);

/** Key format: vl_<12-char prefix>_<secret>. Only the SHA-256 of the whole key is stored; the key is shown once. */
export async function createApiKey(p: Principal, name: string, scope: ApiScope, days: number): Promise<{ key: string; view: ApiKeyView }> {
  const prefix = randomBytes(9).toString("base64url");
  const key = `vl_${prefix}_${randomBytes(32).toString("base64url")}`;
  const expires = new Date(Date.now() + days * 86_400_000);
  const row = await tenantTx(p.tenantId, async (c) => (await c.query(
    "INSERT INTO intelligence_api_keys(tenant_id,name,scope,location_ids,prefix,key_hash,created_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
    [p.tenantId, name, scope, JSON.stringify(p.locationIds), prefix, hash(key), p.name || p.email, expires.toISOString()],
  )).rows[0] as Row);
  return { key, view: toView(row) };
}

function toView(r: Row): ApiKeyView {
  return { id: String(r.id), name: String(r.name), scope: r.scope as ApiScope, prefix: `vl_${String(r.prefix)}`, createdBy: String(r.created_by), createdAt: iso(r.created_at)!, expiresAt: iso(r.expires_at)!, revokedAt: iso(r.revoked_at), lastUsedAt: iso(r.last_used_at) };
}

export async function listApiKeys(tenantId: string): Promise<ApiKeyView[]> {
  return tenantTx(tenantId, async (c) => (await c.query("SELECT * FROM intelligence_api_keys WHERE tenant_id=$1 ORDER BY created_at DESC", [tenantId])).rows.map((r) => toView(r as Row)));
}

export async function revokeApiKey(tenantId: string, id: string): Promise<boolean> {
  return tenantTx(tenantId, async (c) => (await c.query("UPDATE intelligence_api_keys SET revoked_at = now() WHERE tenant_id=$1 AND id=$2 AND revoked_at IS NULL RETURNING id", [tenantId, id])).rows.length > 0);
}

export type ApiCaller = { keyId: string; tenantId: string; scope: ApiScope; locationIds: string[] };

/** Resolves an `Authorization: Bearer vl_…` header. Revoked, expired or mismatched keys resolve to null. */
export async function authenticateApiKey(header: string | null): Promise<ApiCaller | null> {
  const match = /^Bearer (vl_([A-Za-z0-9_-]{12})_[A-Za-z0-9_-]{43})$/.exec(header ?? "");
  if (!match) return null;
  const [, key, prefix] = match;
  const row = (await plain((c) => c.query("SELECT * FROM intelligence_api_key_lookup($1)", [prefix]))).rows[0] as Row | undefined;
  if (!row) return null;
  const expected = Buffer.from(String(row.key_hash), "hex");
  const actual = Buffer.from(hash(key!), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  await plain((c) => c.query("SELECT intelligence_api_key_used($1)", [row.id]));
  return { keyId: String(row.id), tenantId: String(row.tenant_id), scope: row.scope as ApiScope, locationIds: (row.location_ids as string[]) ?? [] };
}
