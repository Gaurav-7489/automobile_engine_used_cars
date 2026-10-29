import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { commercePlans, type AcquisitionRequest, type ApiScope, type BusinessKey, type CommerceState, type DataSource } from "@vandlabs/contracts";
import { CommerceError, acquisitionInput, allowedSource, fuelPrices, ingestBatch, queryVehicles, recommend } from "@vandlabs/data/commerce-rules";
import { problem, rateLimited } from "../api";
import { clientKey, hitShared } from "../rate-limit";
import { tenantTx, type SqlClient } from "./db";
import { readEntitlements } from "./entitlement-store";

/**
 * The business API for the dealership's own systems and approved suppliers: vehicles and fuel prices from approved sourcing data,
 * acquisition recommendations, and supplier ingest. Keys keep the legacy format (`vand_<tenant>.<id>.<secret>`) and live in the
 * dealership's commerce record, so keys issued by the legacy platform keep working. Calls are metered against the plan's allowance.
 */
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
const SCOPES: ApiScope[] = ["vehicles:read", "recommendations:read", "fuel:read", "sourcing:write"];
export const BUSINESS_SCOPES = SCOPES;
const empty = (): CommerceState => ({ subscription: null, sources: [], vehicles: [], fuel: [], keys: [], usage: {}, audit: [] });

function parse(header: string | null): { tenantId: string; id: string; token: string } | null {
  const m = /^Bearer (vand_([A-Za-z0-9_-]{1,150})\.([a-f0-9-]{36})\.[A-Za-z0-9_-]{43})$/.exec(header ?? "");
  if (!m) return null;
  const tenantId = Buffer.from(m[2], "base64url").toString("utf8");
  return /^[0-9a-f-]{36}$/i.test(tenantId) ? { tenantId, id: m[3], token: m[1] } : null;
}

async function save(c: SqlClient, tenantId: string, state: CommerceState) {
  await c.query("UPDATE dealer_commerce SET payload = $2, version = version + 1, updated_at = now() WHERE tenant_id = $1", [tenantId, state]);
}

function meter(state: CommerceState, keyId: string, now: Date) {
  const sub = state.subscription;
  if (!sub || sub.status !== "active" || Date.parse(sub.expiresAt) <= now.getTime()) throw new CommerceError(402, "An active dealership subscription is required.");
  const limits = commercePlans[sub.plan];
  const monthly = `month:${now.toISOString().slice(0, 7)}`, minute = `minute:${now.toISOString().slice(0, 16)}`;
  state.usage = Object.fromEntries(Object.entries(state.usage ?? {}).filter(([k]) => k === monthly || k === minute));
  if ((state.usage[monthly] ?? 0) >= limits.monthlyRequests) throw new CommerceError(429, "Monthly request quota exhausted.");
  if ((state.usage[minute] ?? 0) >= limits.perMinute) throw new CommerceError(429, "Tenant request rate exceeded.", 60 - now.getUTCSeconds());
  state.usage[monthly] = (state.usage[monthly] ?? 0) + 1;
  state.usage[minute] = (state.usage[minute] ?? 0) + 1;
  state.audit = [{ actor: keyId, action: "api.request", subject: "metered", at: now.toISOString() }, ...(state.audit ?? [])].slice(0, 500);
  return { monthlyUsed: state.usage[monthly], monthlyLimit: limits.monthlyRequests };
}

/** Authenticates the key, applies the scope and plan, runs `action` against the commerce state in one locked transaction. */
export async function businessCall(request: Request, scope: ApiScope, input: Record<string, unknown>, action: (state: CommerceState, key: BusinessKey, now: Date) => unknown): Promise<Response> {
  const ip = await hitShared(`biz-ip:${clientKey(request)}`, 120, 60_000);
  if (!ip.allowed) return rateLimited("Too many requests.", ip.retryAfter);
  const parsed = parse(request.headers.get("authorization"));
  if (!parsed) return problem(401, "unauthenticated", "Send your API key using Authorization: Bearer <key>.");
  const now = new Date();
  try {
    const body = await tenantTx(parsed.tenantId, async (c) => {
      const row = (await c.query("SELECT payload FROM dealer_commerce WHERE tenant_id = $1 FOR UPDATE", [parsed.tenantId])).rows[0] as { payload: CommerceState } | undefined;
      const state = row?.payload ?? empty();
      const key = state.keys.find((k) => k.id === parsed.id);
      const given = Buffer.from(digest(parsed.token), "hex");
      const stored = key ? Buffer.from(key.digest, "hex") : Buffer.alloc(32);
      const same = given.length === stored.length && timingSafeEqual(given, stored);
      if (!key || !same || key.revokedAt || Date.parse(key.expiresAt) <= now.getTime()) throw new CommerceError(401, "Invalid or expired API key.");
      // Entitlements are checked only after the key is proven, so an unauthenticated caller learns nothing about a dealership.
      const entitlements = await readEntitlements(c, parsed.tenantId);
      if (!entitlements.features.api_access.enabled) throw new CommerceError(403, entitlements.features.api_access.reason);
      if (!key.scopes.includes(scope)) throw new CommerceError(403, "API key does not include this scope.");
      const limit = await hitShared(`biz-key:${key.id}`, 60, 60_000);
      if (!limit.allowed) throw new CommerceError(429, "This key is over 60 requests per minute.", limit.retryAfter);
      key.lastUsedAt = now.toISOString();
      const usage = meter(state, key.id, now);
      const data = action(state, key, now);
      await save(c, parsed.tenantId, state);
      return { data, usage, version: "v1", generatedAt: now.toISOString(), demo: state.sources.some((s) => s.kind === "demo") };
    });
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof CommerceError) {
      if (error.status === 429) return rateLimited(error.message, error.retryAfter ?? 60);
      return problem(error.status === 402 ? 403 : error.status, error.status === 402 ? "not_entitled" : error.status === 401 ? "unauthenticated" : "invalid", error.message);
    }
    console.error(JSON.stringify({ event: "business_api_failure", message: error instanceof Error ? error.message : "unknown" }));
    return problem(500, "failed", "The request failed. Nothing was changed.");
  }
}

export const runVehicles = (state: CommerceState, input: Record<string, unknown>, now: Date) => queryVehicles(state, input, now);
export const runFuel = (state: CommerceState, input: Record<string, unknown>, now: Date) => {
  const city = input.city === undefined ? "" : String(input.city).slice(0, 120);
  return fuelPrices(state, true, now).filter((f) => !city || f.city.toLowerCase() === city.toLowerCase());
};
export const runRecommendations = (state: CommerceState, input: Record<string, unknown>, now: Date) => recommend(state, acquisitionInput(input) as AcquisitionRequest, state.subscription!.plan, true, now);
export const runIngest = (state: CommerceState, key: BusinessKey, input: Record<string, unknown>, now: Date) => {
  if (!key.sourceId || input.sourceId !== key.sourceId) throw new CommerceError(403, "This supplier key is restricted to its approved source.");
  return ingestBatch(state, key.sourceId, input, now);
};

/* Key management for the dealership (owner, password-confirmed). */

export type BusinessKeyView = { id: string; name: string; prefix: string; scopes: ApiScope[]; sourceId?: string; expiresAt: string; revokedAt: string | null; createdAt: string; lastUsedAt: string | null };
const view = (k: BusinessKey): BusinessKeyView => ({ id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes, sourceId: k.sourceId, expiresAt: k.expiresAt, revokedAt: k.revokedAt, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt });

export async function listBusinessKeys(c: SqlClient, tenantId: string): Promise<{ keys: BusinessKeyView[]; sources: Pick<DataSource, "id" | "name">[]; limit: number | null }> {
  const state = ((await c.query("SELECT payload FROM dealer_commerce WHERE tenant_id = $1", [tenantId])).rows[0]?.payload as CommerceState | undefined) ?? empty();
  return { keys: state.keys.map(view), sources: state.sources.filter((s) => s.enabled).map((s) => ({ id: s.id, name: s.name })), limit: state.subscription ? commercePlans[state.subscription.plan].maxKeys : null };
}

export async function createBusinessKey(c: SqlClient, tenantId: string, actor: string, input: { name: string; scopes: ApiScope[]; sourceId?: string; days: number }, now = new Date()): Promise<{ token: string; key: BusinessKeyView }> {
  const row = (await c.query("SELECT payload FROM dealer_commerce WHERE tenant_id = $1 FOR UPDATE", [tenantId])).rows[0] as { payload: CommerceState } | undefined;
  const state = row?.payload;
  const sub = state?.subscription;
  if (!state || !sub || sub.status !== "active" || Date.parse(sub.expiresAt) <= now.getTime()) throw new CommerceError(402, "An active dealership subscription is required.");
  const limits = commercePlans[sub.plan];
  if (state.keys.filter((k) => !k.revokedAt && Date.parse(k.expiresAt) > now.getTime()).length >= limits.maxKeys || state.keys.length >= 200) throw new CommerceError(409, "API key limit reached. Revoke an unused key or contact support.");
  const sourceId = input.scopes.includes("sourcing:write") ? input.sourceId : undefined;
  if (input.scopes.includes("sourcing:write") && !allowedSource(state.sources.find((s) => s.id === sourceId), false, now)) throw new CommerceError(403, "Select an approved, active source for supplier ingestion.");
  const id = randomUUID(), token = `vand_${Buffer.from(tenantId).toString("base64url")}.${id}.${randomBytes(32).toString("base64url")}`;
  const key: BusinessKey = { id, name: input.name, prefix: `vand_…${id.slice(0, 8)}`, digest: digest(token), scopes: input.scopes, sourceId, expiresAt: new Date(now.getTime() + input.days * 86_400_000).toISOString(), revokedAt: null, createdAt: now.toISOString(), lastUsedAt: null };
  state.keys.push(key);
  state.audit = [{ actor, action: "key.create", subject: id, at: now.toISOString() }, ...(state.audit ?? [])].slice(0, 500);
  await save(c, tenantId, state);
  return { token, key: view(key) };
}

export async function revokeBusinessKey(c: SqlClient, tenantId: string, actor: string, id: string, now = new Date()): Promise<boolean> {
  const row = (await c.query("SELECT payload FROM dealer_commerce WHERE tenant_id = $1 FOR UPDATE", [tenantId])).rows[0] as { payload: CommerceState } | undefined;
  const key = row?.payload.keys.find((k) => k.id === id);
  if (!row || !key || key.revokedAt) return false;
  key.revokedAt = now.toISOString();
  row.payload.audit = [{ actor, action: "key.revoke", subject: id, at: now.toISOString() }, ...(row.payload.audit ?? [])].slice(0, 500);
  await save(c, tenantId, row.payload);
  return true;
}
