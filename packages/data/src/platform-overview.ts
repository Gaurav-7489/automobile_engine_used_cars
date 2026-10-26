import { commercePlans, planEntitlements, type CommercePlan, type CommerceState, type PlatformTenant } from "@vandlabs/contracts";
import { entitlementState, aiUsageKey } from "./entitlements";
import { sourceSyncSummary } from "./provider-sync";

export type MeterKey = "seats" | "locations" | "inventory" | "ai" | "api";
export interface Meter { key: MeterKey; label: string; used: number; limit: number; ratio: number }
export interface OverviewAlert { severity: "critical" | "warning" | "info"; tenantId: string | null; message: string }
export interface TenantOverview { tenantId: string; organization: string; plan: CommercePlan | null; state: "active" | "inactive" | "unsubscribed" | "unknown"; expiresAt: string | null; daysLeft: number | null; reference: string | null; meters: Meter[] }
export interface PlatformOverview {
  generatedAt: string;
  plans: Record<CommercePlan | "none", number>;
  inactive: number;
  tenants: TenantOverview[];
  alerts: OverviewAlert[];
  /** Billing is not activated; no revenue figure is ever derived. */
  billing: { activated: false };
}
/** The slice of a tenant's commerce state the overview needs; absent when the tenant has none yet. */
export type CommerceSlice = Pick<CommerceState, "subscription" | "usage" | "sources" | "sourceSync">;

const ratio = (used: number, limit: number) => limit > 0 ? used / limit : 0;
const WARN = 0.9, EXPIRY_DAYS = 14;

/**
 * Pure and deterministic: every figure comes from recorded tenant data. Nothing is estimated, and
 * missing data produces an explicit alert instead of a default number.
 */
export function buildPlatformOverview(tenants: PlatformTenant[], commerce: Map<string, CommerceSlice | null> | null, readiness: { ready: boolean; checks: { key: string; ready: boolean }[] } | null, now: Date): PlatformOverview {
  const plans: PlatformOverview["plans"] = { starter: 0, growth: 0, scale: 0, none: 0 };
  const alerts: OverviewAlert[] = [];
  let inactive = 0;
  if (commerce === null) alerts.push({ severity: "warning", tenantId: null, message: "Subscription data could not be loaded; plan distribution and usage are unavailable." });
  const rows = tenants.map((t): TenantOverview => {
    if (commerce === null) return { tenantId: t.tenantId, organization: t.organization, plan: null, state: "unknown", expiresAt: null, daysLeft: null, reference: null, meters: [] };
    const slice = commerce.get(t.tenantId) ?? null, subscription = slice?.subscription ?? null;
    const state = entitlementState(subscription, now), limits = state.entitlements;
    const seats = t.staff.filter(s => s.enabled).length, locations = t.dealerships.reduce((n, d) => n + d.locations.length, 0);
    const month = now.toISOString().slice(0, 7), usage = slice?.usage ?? {};
    const meters: Meter[] = [
      { key: "seats", label: "Staff seats", used: seats, limit: limits.seats, ratio: ratio(seats, limits.seats) },
      { key: "locations", label: "Locations", used: locations, limit: limits.locations, ratio: ratio(locations, limits.locations) },
      { key: "inventory", label: "Unsold vehicles", used: t.counts.unsoldVehicles, limit: limits.inventory, ratio: ratio(t.counts.unsoldVehicles, limits.inventory) },
      { key: "ai", label: "AI requests this month", used: usage[aiUsageKey(now)] ?? 0, limit: limits.aiRequestsPerMonth, ratio: ratio(usage[aiUsageKey(now)] ?? 0, limits.aiRequestsPerMonth) },
      { key: "api", label: "API requests this month", used: usage[`month:${month}`] ?? 0, limit: commercePlans[state.plan].monthlyRequests, ratio: ratio(usage[`month:${month}`] ?? 0, commercePlans[state.plan].monthlyRequests) },
    ];
    const daysLeft = subscription ? Math.floor((Date.parse(subscription.expiresAt) - now.getTime()) / 86400000) : null;
    if (!subscription) { plans.none++; alerts.push({ severity: "warning", tenantId: t.tenantId, message: `${t.organization} has no subscription record and runs on Starter limits.` }); }
    else if (Object.hasOwn(planEntitlements, subscription.plan)) plans[subscription.plan]++; else plans.none++;
    if (state.status === "inactive") {
      inactive++;
      alerts.push({ severity: "critical", tenantId: t.tenantId, message: `${t.organization} subscription is ${subscription!.status === "active" ? "expired" : subscription!.status}; new seats, stock and paid features are blocked.` });
    } else if (daysLeft !== null && daysLeft <= EXPIRY_DAYS) {
      alerts.push({ severity: "warning", tenantId: t.tenantId, message: `${t.organization} subscription expires in ${Math.max(daysLeft, 0)} day${daysLeft === 1 ? "" : "s"}.` });
    }
    for (const m of meters) {
      if (m.used > m.limit) alerts.push({ severity: "critical", tenantId: t.tenantId, message: `${t.organization} is over its ${m.label.toLowerCase()} limit (${m.used} of ${m.limit}).` });
      else if (m.ratio >= WARN) alerts.push({ severity: "warning", tenantId: t.tenantId, message: `${t.organization} has used ${Math.round(m.ratio * 100)}% of ${m.label.toLowerCase()} (${m.used} of ${m.limit}).` });
    }
    for (const source of slice?.sources ?? []) {
      const sync = sourceSyncSummary(slice as CommerceState, source.id, now);
      if (sync && (sync.status === "failed" || sync.status === "interrupted")) alerts.push({ severity: "warning", tenantId: t.tenantId, message: `${t.organization} source "${source.name}" last sync ${sync.status}${sync.error ? ` (${sync.error})` : ""}.` });
    }
    return { tenantId: t.tenantId, organization: t.organization, plan: subscription && Object.hasOwn(planEntitlements, subscription.plan) ? subscription.plan : null, state: state.status, expiresAt: subscription?.expiresAt ?? null, daysLeft, reference: subscription?.reference ?? null, meters };
  });
  if (readiness && !readiness.ready) {
    const failing = readiness.checks.filter(c => !c.ready).map(c => c.key);
    alerts.push({ severity: "critical", tenantId: null, message: `Platform configuration incomplete: ${failing.slice(0, 6).join(", ")}${failing.length > 6 ? ` and ${failing.length - 6} more` : ""}.` });
  }
  const order = { critical: 0, warning: 1, info: 2 } as const;
  alerts.sort((a, b) => order[a.severity] - order[b.severity]);
  return { generatedAt: now.toISOString(), plans, inactive, tenants: rows, alerts, billing: { activated: false } };
}
