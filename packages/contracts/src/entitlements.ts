import type { CommercePlan } from "./commerce";

/** Features that are gated by plan. Only gates the backend enforces belong here. */
export type PlanFeature = "market_intelligence" | "provider_sync";

export interface PlanEntitlements {
  /** Enabled staff accounts. */
  seats: number;
  /** Dealership locations. Enforced when a plan is assigned or changed. */
  locations: number;
  /** Vehicles that are not sold. */
  inventory: number;
  /** AI commentary requests per calendar month. */
  aiRequestsPerMonth: number;
  /** Declared allowance; not yet enforced because no upload path meters bytes. */
  storageMb: number;
  features: readonly PlanFeature[];
}

/**
 * Central plan catalogue. API request quotas, API key counts, two-car planning and cross-city
 * sourcing remain in `commercePlans`. These limits are provisional product decisions, not prices:
 * change them here and every backend check follows.
 */
export const planEntitlements: Record<CommercePlan, PlanEntitlements> = {
  starter: { seats: 3, locations: 1, inventory: 50, aiRequestsPerMonth: 50, storageMb: 1024, features: [] },
  growth: { seats: 10, locations: 3, inventory: 250, aiRequestsPerMonth: 500, storageMb: 10240, features: ["market_intelligence", "provider_sync"] },
  scale: { seats: 40, locations: 15, inventory: 2000, aiRequestsPerMonth: 5000, storageMb: 102400, features: ["market_intelligence", "provider_sync"] },
};

export function planAllows(plan: CommercePlan, feature: PlanFeature): boolean {
  return planEntitlements[plan].features.includes(feature);
}
