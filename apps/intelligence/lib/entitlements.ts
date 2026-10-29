import { commercePlans, type CommercePlan } from "@vandlabs/contracts";

/**
 * What a dealership may use. A feature is available unless a platform administrator has switched it off for that dealership;
 * features marked `needsSubscription` also need an active, unexpired subscription (as the acquisition and business-API services
 * always have). Packaging features into plan tiers is a product decision that has not been made, so plans carry only the usage
 * limits that already existed; the per-dealership switches are how access is controlled today.
 */
export type FeatureKey =
  | "market" | "inventory" | "pricing" | "advertising" | "leads" | "capital" | "alerts" | "reports" | "stock_intelligence" | "automations" | "acquisition" | "api_access" | "desktop";

export const FEATURES: { key: FeatureKey; label: string; needsSubscription: boolean; description: string }[] = [
  { key: "inventory", label: "Inventory", needsSubscription: false, description: "Stock records, import, lifecycle." },
  { key: "leads", label: "Leads and customers", needsSubscription: false, description: "CRM, follow-ups, appointments." },
  { key: "pricing", label: "Pricing intelligence", needsSubscription: false, description: "Evidence-led price requests and approval." },
  { key: "advertising", label: "Advertising studio", needsSubscription: false, description: "Campaign drafts and approval." },
  { key: "capital", label: "Capital and profit", needsSubscription: false, description: "Landed cost, realized profit, ledger." },
  { key: "alerts", label: "Alerts and actions", needsSubscription: false, description: "Rule-driven alerts and work queue." },
  { key: "reports", label: "Reports and analytics", needsSubscription: false, description: "Period reports and exports." },
  { key: "market", label: "Market radar", needsSubscription: false, description: "Licensed market evidence, valuations." },
  { key: "stock_intelligence", label: "Stock intelligence", needsSubscription: false, description: "Ageing and dead-stock review prompts." },
  { key: "automations", label: "Automations", needsSubscription: false, description: "Follow-up rules with recorded runs." },
  { key: "acquisition", label: "Acquisition research", needsSubscription: true, description: "Recommendations from permitted sourcing data." },
  { key: "api_access", label: "Business API", needsSubscription: true, description: "API keys and programmatic access." },
  { key: "desktop", label: "Desktop application", needsSubscription: false, description: "Sign in from the desktop client." },
];

export type SubscriptionRecord = { plan: CommercePlan; status: "active" | "suspended" | "cancelled"; expiresAt: string; reference: string; updatedAt?: string };
export type SubscriptionState = "none" | "active" | "suspended" | "cancelled" | "expired";

export type Entitlements = {
  subscription: SubscriptionRecord | null;
  state: SubscriptionState;
  limits: (typeof commercePlans)[CommercePlan] | null;
  features: Record<FeatureKey, { enabled: boolean; reason: string }>;
};

export const FEATURE_KEYS = FEATURES.map((f) => f.key);
export const isFeatureKey = (v: unknown): v is FeatureKey => typeof v === "string" && (FEATURE_KEYS as string[]).includes(v);

export function subscriptionState(subscription: SubscriptionRecord | null, now: Date): SubscriptionState {
  if (!subscription) return "none";
  if (subscription.status !== "active") return subscription.status;
  return Date.parse(subscription.expiresAt) > now.getTime() ? "active" : "expired";
}

export function resolveEntitlements(subscription: SubscriptionRecord | null, overrides: Partial<Record<FeatureKey, boolean>>, now: Date = new Date()): Entitlements {
  const state = subscriptionState(subscription, now);
  const features = {} as Entitlements["features"];
  for (const f of FEATURES) {
    if (overrides[f.key] === false) features[f.key] = { enabled: false, reason: "Not included for this dealership. Contact VandLabs to change this." };
    else if (f.needsSubscription && state !== "active") {
      features[f.key] = { enabled: false, reason: state === "none" ? "Needs an active subscription. None is recorded for this dealership." : state === "expired" ? "The subscription has expired." : `The subscription is ${state}.` };
    } else features[f.key] = { enabled: true, reason: "" };
  }
  return { subscription, state, limits: subscription ? commercePlans[subscription.plan] : null, features };
}

/** Commands that belong to a switchable feature. Everything not listed (settings, team, notifications) is always available. */
export const COMMAND_FEATURE: Record<string, FeatureKey> = {
  addVehicle: "inventory", updateVehicle: "inventory", transitionVehicle: "inventory", importCommit: "inventory", bulkArchive: "inventory", bulkAssignBranch: "inventory", publishVehicles: "inventory",
  addLead: "leads", changeStage: "leads", logOutcome: "leads", sendMessage: "leads", retryMessage: "leads", scheduleAppointment: "leads", cancelAppointment: "leads", toggleTask: "leads", assignLead: "leads", mergeLeads: "leads",
  createPriceRequest: "pricing", submitPriceRequest: "pricing", approvePriceRequest: "pricing", rejectPriceRequest: "pricing", withdrawPriceRequest: "pricing", retryFailedChannels: "pricing",
  createCampaign: "advertising", updateCampaign: "advertising", changeVehicle: "advertising", submitCampaign: "advertising", approveCampaign: "advertising", publishCampaign: "advertising", pauseCampaign: "advertising", resumeCampaign: "advertising", discardCampaign: "advertising",
  proposeCorrection: "capital", acknowledge: "alerts", assignAlerts: "alerts", snooze: "alerts", resolve: "alerts", updateRules: "alerts",
  toggleWatch: "market", saveSearch: "market", renameSearch: "market", deleteSearch: "market", logContactIntent: "market", saveScenario: "market",
};

export const entitled = (e: Entitlements | undefined, key: FeatureKey): boolean => e === undefined || e.features[key].enabled;
