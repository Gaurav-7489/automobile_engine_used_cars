import { commercePlans, planEntitlements, planAllows, type CommercePlan, type DealerSubscription, type PlanEntitlements, type PlanFeature } from "@vandlabs/contracts";
import { CommerceError } from "./commerce-rules";
import type { SqlClient } from "./postgres";

export interface TenantUsage { seats: number; locations: number; inventory: number }
export interface EntitlementState { plan: CommercePlan; entitlements: PlanEntitlements; status: "active" | "unsubscribed" | "inactive" }

/**
 * A tenant without a subscription record keeps working on Starter limits and no paid features, so
 * onboarding does not depend on ordering. A suspended, cancelled or expired subscription may not grow.
 */
export function entitlementState(subscription: DealerSubscription | null | undefined, now: Date): EntitlementState {
  if (!subscription) return { plan: "starter", entitlements: planEntitlements.starter, status: "unsubscribed" };
  if (!Object.hasOwn(planEntitlements, subscription.plan)) return { plan: "starter", entitlements: planEntitlements.starter, status: "inactive" };
  const live = subscription.status === "active" && Date.parse(subscription.expiresAt) > now.getTime();
  return { plan: subscription.plan, entitlements: planEntitlements[subscription.plan], status: live ? "active" : "inactive" };
}
const inactive = () => new CommerceError(402, "An active dealership subscription is required.");
const planName = (plan: CommercePlan) => commercePlans[plan].name;

export function assertSeatAvailable(subscription: DealerSubscription | null | undefined, otherEnabledSeats: number, now: Date) {
  const state = entitlementState(subscription, now);
  if (state.status === "inactive") throw inactive();
  if (otherEnabledSeats + 1 > state.entitlements.seats) throw new CommerceError(409, `The ${planName(state.plan)} plan includes ${state.entitlements.seats} staff seats. Disable a user or upgrade the plan.`);
}
export function assertInventoryRoom(subscription: DealerSubscription | null | undefined, currentVehicles: number, adding: number, now: Date) {
  const state = entitlementState(subscription, now);
  if (state.status === "inactive") throw inactive();
  if (currentVehicles + adding > state.entitlements.inventory) throw new CommerceError(409, `The ${planName(state.plan)} plan includes ${state.entitlements.inventory} unsold vehicles (${currentVehicles} in stock). Mark sold vehicles or upgrade the plan.`);
}
const featureNames: Record<PlanFeature, string> = { market_intelligence: "Market intelligence", provider_sync: "Licensed feed synchronization" };
export function assertFeature(subscription: DealerSubscription | null | undefined, feature: PlanFeature, now: Date) {
  const state = entitlementState(subscription, now);
  if (state.status !== "active") throw inactive();
  if (!planAllows(state.plan, feature)) throw new CommerceError(403, `${featureNames[feature]} is not included in the ${planName(state.plan)} plan. Upgrade to Growth or Scale.`);
}
/** Refuses a plan assignment that the tenant's current usage could not live within. */
export function assertPlanFits(plan: CommercePlan, usage: TenantUsage) {
  const limits = planEntitlements[plan], over: string[] = [];
  if (usage.seats > limits.seats) over.push(`${usage.seats} staff seats (limit ${limits.seats})`);
  if (usage.locations > limits.locations) over.push(`${usage.locations} locations (limit ${limits.locations})`);
  if (usage.inventory > limits.inventory) over.push(`${usage.inventory} unsold vehicles (limit ${limits.inventory})`);
  if (over.length) throw new CommerceError(409, `The ${planName(plan)} plan cannot hold current usage: ${over.join(", ")}. Reduce usage first.`);
}
export function aiUsageKey(now: Date) { return `ai:${now.toISOString().slice(0, 7)}`; }
/** Consumes one AI request from the month's allowance; false when exhausted or the subscription is not active. */
export function takeAiRequest(usage: Record<string, number>, subscription: DealerSubscription | null | undefined, now: Date): boolean {
  const state = entitlementState(subscription, now), key = aiUsageKey(now);
  if (state.status === "inactive" || (usage[key] ?? 0) >= state.entitlements.aiRequestsPerMonth) return false;
  usage[key] = (usage[key] ?? 0) + 1;
  return true;
}

/** Reads the tenant subscription inside its RLS transaction. Environments that have not applied the commerce migration read as unsubscribed. */
export async function readSubscription(c: SqlClient, tenantId: string): Promise<DealerSubscription | null> {
  const readable = (await c.query("SELECT COALESCE(has_table_privilege(to_regclass('public.dealer_commerce'),'SELECT'),false) AS readable")).rows[0]?.readable === true;
  if (!readable) return null;
  const row = (await c.query("SELECT payload->'subscription' AS subscription FROM dealer_commerce WHERE tenant_id=$1", [tenantId])).rows[0];
  return (row?.subscription as DealerSubscription | null | undefined) ?? null;
}
export async function countUsage(c: SqlClient, tenantId: string): Promise<TenantUsage> {
  const row = (await c.query(`SELECT
    (SELECT count(*) FROM staff_members WHERE tenant_id=$1 AND payload->>'enabled'='true') AS seats,
    (SELECT count(*) FROM locations WHERE tenant_id=$1) AS locations,
    (SELECT count(*) FROM vehicles WHERE tenant_id=$1 AND availability_status<>'sold') AS inventory`, [tenantId])).rows[0];
  return { seats: Number(row.seats), locations: Number(row.locations), inventory: Number(row.inventory) };
}
/** Local demonstration subscription; dynamic import avoids a module cycle with the commerce service. */
export async function demoSubscription(tenantId: string): Promise<DealerSubscription | null> {
  try {
    const { commerceRepository } = await import("./commerce");
    const repository = await commerceRepository();
    const read = (repository.read ?? repository.transact).bind(repository);
    return await read<DealerSubscription | null>(tenantId, state => state.subscription);
  } catch { return null; }
}
