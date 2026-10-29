import { commercePlans } from "@vandlabs/contracts";
import { FEATURE_KEYS, isFeatureKey, resolveEntitlements, type Entitlements, type FeatureKey, type SubscriptionRecord } from "../entitlements";
import type { SqlClient } from "./db";
import { plain } from "./db";

type Row = Record<string, unknown>;

/** Short per-instance memo so entitlement checks on every request do not each cost a database read. Cleared on any change made here. */
const memo = new Map<string, { at: number; value: Entitlements }>();
const MEMO_MS = 10_000;
export const clearEntitlementMemo = (tenantId?: string) => (tenantId ? memo.delete(tenantId) : memo.clear());

const asOverrides = (raw: unknown): Partial<Record<FeatureKey, boolean>> => {
  const out: Partial<Record<FeatureKey, boolean>> = {};
  if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw)) if (isFeatureKey(k) && typeof v === "boolean") out[k] = v;
  return out;
};
const asSubscription = (raw: unknown): SubscriptionRecord | null => {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Row;
  if (typeof s.plan !== "string" || !Object.hasOwn(commercePlans, s.plan) || typeof s.expiresAt !== "string") return null;
  return { plan: s.plan as SubscriptionRecord["plan"], status: (["active", "suspended", "cancelled"].includes(String(s.status)) ? s.status : "cancelled") as SubscriptionRecord["status"], expiresAt: s.expiresAt, reference: String(s.reference ?? ""), updatedAt: typeof s.updatedAt === "string" ? s.updatedAt : undefined };
};

/** A dealership's entitlements, read inside its own tenant transaction (row-level security scopes the read). */
export async function readEntitlements(c: SqlClient, tenantId: string): Promise<Entitlements> {
  const hit = memo.get(tenantId);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.value;
  const row = (await c.query("SELECT payload->'subscription' AS subscription, payload->'features' AS features FROM dealer_commerce WHERE tenant_id = $1", [tenantId])).rows[0] as Row | undefined;
  const value = resolveEntitlements(asSubscription(row?.subscription), asOverrides(row?.features));
  memo.set(tenantId, { at: Date.now(), value });
  return value;
}

export type AdminCommerce = { entitlements: Entitlements; features: Partial<Record<FeatureKey, boolean>>; usage: Record<string, unknown>; sources: { id: string; name: string; kind: string; enabled: boolean; expiresAt: string }[] };

export async function adminReadCommerce(adminId: string, tenantId: string): Promise<AdminCommerce | null> {
  const row = (await plain((c) => c.query("SELECT * FROM intelligence_admin_commerce($1, $2)", [adminId, tenantId]))).rows[0] as Row | undefined;
  const exists = (await plain((c) => c.query("SELECT intelligence_is_platform_admin($1) AS ok", [adminId]))).rows[0]?.ok === true;
  if (!exists) return null;
  const features = asOverrides(row?.features);
  return {
    entitlements: resolveEntitlements(asSubscription(row?.subscription), features), features, usage: (row?.usage as Record<string, unknown>) ?? {},
    sources: ((row?.sources as Row[]) ?? []).map((s) => ({ id: String(s.id), name: String(s.name), kind: String(s.kind), enabled: s.enabled === true, expiresAt: String(s.expiresAt) })),
  };
}

export type EntitlementInput = { subscription: { plan: string; status: string; expiresOn: string; reference: string } | null; features: Record<string, unknown> };
export type EntitlementProblem = Record<string, string>;

/** Validates input from the admin console into the stored shapes. Returns field errors or the normalised values. */
export function validateEntitlementInput(input: EntitlementInput, now = new Date()): { fields: EntitlementProblem } | { subscription: SubscriptionRecord | null; features: Partial<Record<FeatureKey, boolean>> } {
  const fields: EntitlementProblem = {};
  let subscription: SubscriptionRecord | null = null;
  if (input.subscription) {
    const s = input.subscription;
    if (!Object.hasOwn(commercePlans, s.plan)) fields.plan = "Choose a plan.";
    if (!["active", "suspended", "cancelled"].includes(s.status)) fields.status = "Choose a status.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.expiresOn) || Number.isNaN(Date.parse(`${s.expiresOn}T23:59:59Z`))) fields.expiresOn = "Enter the last day of access.";
    else if (s.status === "active" && Date.parse(`${s.expiresOn}T23:59:59Z`) <= now.getTime()) fields.expiresOn = "An active subscription must end in the future.";
    const reference = (s.reference ?? "").trim();
    if (reference.length < 3 || reference.length > 120) fields.reference = "Record the contract or invoice reference (3 to 120 characters).";
    if (!Object.keys(fields).length) subscription = { plan: s.plan as SubscriptionRecord["plan"], status: s.status as SubscriptionRecord["status"], expiresAt: `${s.expiresOn}T23:59:59.000Z`, reference, updatedAt: now.toISOString() };
  }
  const features: Partial<Record<FeatureKey, boolean>> = {};
  for (const [k, v] of Object.entries(input.features ?? {})) {
    if (!isFeatureKey(k) || typeof v !== "boolean") { fields.features = "Unknown feature."; break; }
    // Only switched-off features are stored; everything else is the default.
    if (v === false) features[k] = false;
  }
  return Object.keys(fields).length ? { fields } : { subscription, features };
}

export async function adminSetEntitlements(adminId: string, tenantId: string, subscription: SubscriptionRecord | null, features: Partial<Record<FeatureKey, boolean>>): Promise<boolean> {
  const ok = (await plain((c) => c.query("SELECT intelligence_admin_set_entitlements($1, $2, $3::jsonb, $4::jsonb) AS ok", [adminId, tenantId, subscription ? JSON.stringify(subscription) : null, JSON.stringify(features)]))).rows[0]?.ok === true;
  if (ok) clearEntitlementMemo(tenantId);
  return ok;
}

export type PlatformAuditRow = { id: string; tenantId: string; organization: string; actor: string; actorName: string; action: string; subject: string; detail: string; at: string };

export async function adminAudit(adminId: string, filter: { tenantId?: string; action?: string; q?: string; page: number; size: number }): Promise<{ rows: PlatformAuditRow[]; total: number }> {
  const rows = (await plain((c) => c.query("SELECT * FROM intelligence_admin_audit($1, $2, $3, $4, $5, $6)", [adminId, filter.tenantId ?? null, filter.action ?? null, filter.q || null, filter.size, (filter.page - 1) * filter.size]))).rows as Row[];
  return {
    rows: rows.map((r) => ({ id: String(r.id), tenantId: String(r.tenant_id), organization: String(r.organization ?? "Unknown"), actor: String(r.actor), actorName: String(r.actor_name ?? ""), action: String(r.action), subject: String(r.subject), detail: JSON.stringify(r.payload ?? {}).slice(0, 400), at: new Date(String(r.occurred_at)).toISOString() })),
    total: rows.length ? Number(rows[0].total) : 0,
  };
}

export { FEATURE_KEYS };
