import type { Role } from "./domain";
import { entitled, type Entitlements, type FeatureKey } from "./entitlements";

export type Capability =
  | "market.view" | "market.export" | "acquisition.review"
  | "inventory.view" | "inventory.edit" | "inventory.transition" | "inventory.bulk"
  | "price.view" | "price.propose" | "price.approve" | "price.floorException"
  | "campaign.view" | "campaign.edit" | "campaign.approve"
  | "leads.view" | "leads.edit" | "leads.contact" | "leads.merge" | "leads.export"
  | "capital.view" | "capital.correct" | "capital.scenario"
  | "alerts.view" | "alerts.act" | "alerts.rules"
  | "reports.view" | "reports.finance" | "reports.export" | "reports.schedule"
  | "settings.view" | "settings.admin" | "settings.integrations" | "settings.team" | "settings.keys" | "settings.audit"
  | "automations.view" | "automations.manage" | "subscription.view";

const ALL: Capability[] = [
  "market.view", "market.export", "acquisition.review", "inventory.view", "inventory.edit", "inventory.transition", "inventory.bulk", "price.view", "price.propose", "price.approve", "price.floorException",
  "campaign.view", "campaign.edit", "campaign.approve", "leads.view", "leads.edit", "leads.contact", "leads.merge", "leads.export", "capital.view", "capital.correct", "capital.scenario",
  "alerts.view", "alerts.act", "alerts.rules", "reports.view", "reports.finance", "reports.export", "reports.schedule", "settings.view", "settings.admin", "settings.integrations", "settings.team", "settings.keys", "settings.audit",
  "automations.view", "automations.manage", "subscription.view",
];

/** Owner controls business, approvals and all permitted branches. Manager manages assigned branches. Inventory edits stock, not approval. Marketing drafts campaigns. Sales handles assigned leads. Finance sees ledgers. Viewer is read-only. */
const MATRIX: Record<Role, Capability[]> = {
  owner: ALL,
  manager: ["market.view", "market.export", "acquisition.review", "inventory.view", "inventory.edit", "inventory.transition", "inventory.bulk", "price.view", "price.propose", "price.approve", "campaign.view", "campaign.edit", "campaign.approve",
    "leads.view", "leads.edit", "leads.contact", "leads.merge", "leads.export", "capital.view", "capital.scenario", "alerts.view", "alerts.act", "alerts.rules", "reports.view", "reports.export", "reports.schedule", "settings.view", "automations.view", "automations.manage"],
  inventory: ["market.view", "acquisition.review", "inventory.view", "inventory.edit", "inventory.transition", "inventory.bulk", "price.view", "price.propose", "campaign.view", "leads.view", "alerts.view", "alerts.act", "settings.view", "automations.view"],
  marketing: ["market.view", "inventory.view", "price.view", "campaign.view", "campaign.edit", "leads.view", "alerts.view", "alerts.act", "reports.view", "reports.export", "settings.view", "automations.view"],
  sales: ["market.view", "inventory.view", "price.view", "campaign.view", "leads.view", "leads.edit", "leads.contact", "alerts.view", "alerts.act", "settings.view", "automations.view"],
  finance: ["market.view", "inventory.view", "price.view", "capital.view", "capital.correct", "capital.scenario", "alerts.view", "reports.view", "reports.finance", "reports.export", "reports.schedule", "settings.view"],
  viewer: ["market.view", "inventory.view", "price.view", "campaign.view", "leads.view", "alerts.view", "settings.view"],
};

export const can = (role: Role, capability: Capability): boolean => MATRIX[role].includes(capability);

/** Explanatory text for disabled controls: read-only roles never see a silent dead button. */
export function requiredRoleText(capability: Capability): string {
  const roles = (Object.keys(MATRIX) as Role[]).filter((role) => MATRIX[role].includes(capability));
  return `Requires ${roles.map((r) => ROLE_LABEL[r]).join(", ")} access.`;
}

export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", manager: "Manager", inventory: "Inventory", marketing: "Marketing", sales: "Sales", finance: "Finance", viewer: "Viewer" };

export const ROLE_SUMMARY: Record<Role, string> = {
  owner: "Controls business, approvals and all permitted branches.",
  manager: "Manages assigned branches, approves prices and budgets.",
  inventory: "Edits stock. Cannot approve prices or budgets.",
  marketing: "Drafts campaigns and reads reports.",
  sales: "Handles assigned leads and follow-up.",
  finance: "Sees ledgers and realized results.",
  viewer: "Read-only access to permitted records.",
};

export const ROLES = Object.keys(MATRIX) as Role[];

/** Mobile bottom navigation and desktop rail order. */
export type NavGroup = "Today" | "Stock" | "Sales" | "Business";
export const NAV: { key: string; label: string; short: string; href: string; icon: string; group: NavGroup; needs?: Capability; feature?: FeatureKey }[] = [
  { key: "overview", label: "Overview", short: "Home", href: "/app/overview", icon: "grid", group: "Today" },
  { key: "assistant", label: "Assistant", short: "Ask", href: "/app/assistant", icon: "sparkle", group: "Today", feature: "assistant" },
  { key: "alerts", label: "Alerts & actions", short: "Alerts", href: "/app/alerts", icon: "bell", group: "Today", needs: "alerts.view", feature: "alerts" },
  { key: "inventory", label: "Inventory", short: "Stock", href: "/app/inventory", icon: "car", group: "Stock", needs: "inventory.view", feature: "inventory" },
  { key: "stock-intelligence", label: "Stock ageing", short: "Ageing", href: "/app/stock-intelligence", icon: "clock", group: "Stock", needs: "inventory.view", feature: "stock_intelligence" },
  { key: "pricing", label: "Pricing", short: "Pricing", href: "/app/pricing", icon: "tag", group: "Stock", needs: "price.view", feature: "pricing" },
  { key: "market", label: "Market Radar", short: "Radar", href: "/app/market", icon: "radar", group: "Stock", needs: "market.view", feature: "market" },
  { key: "state-prices", label: "Prices by state", short: "States", href: "/app/state-prices", icon: "columns", group: "Stock", needs: "market.view" },
  { key: "acquisition", label: "Buying", short: "Buying", href: "/app/acquisition", icon: "map", group: "Stock", needs: "acquisition.review", feature: "acquisition" },
  { key: "leads", label: "Leads & customers", short: "Leads", href: "/app/leads", icon: "users", group: "Sales", needs: "leads.view", feature: "leads" },
  { key: "advertising", label: "Advertising", short: "Ads", href: "/app/advertising", icon: "megaphone", group: "Sales", needs: "campaign.view", feature: "advertising" },
  { key: "showroom", label: "Showroom", short: "Showroom", href: "/app/showroom", icon: "store", group: "Sales", needs: "inventory.view", feature: "inventory" },
  { key: "capital", label: "Capital & profit", short: "Capital", href: "/app/capital", icon: "coins", group: "Business", needs: "capital.view", feature: "capital" },
  { key: "reports", label: "Reports", short: "Reports", href: "/app/reports", icon: "chart", group: "Business", needs: "reports.view", feature: "reports" },
  { key: "automations", label: "Automations", short: "Auto", href: "/app/automations", icon: "zap", group: "Business", needs: "automations.view", feature: "automations" },
  { key: "settings", label: "Settings", short: "Settings", href: "/app/settings/business", icon: "gear", group: "Business", needs: "settings.view" },
];

/** Navigation the signed-in member may use: allowed by role and included in the dealership's entitlements. */
export const visibleNav = (role: Role, entitlements: Entitlements | undefined) => NAV.filter((n) => (!n.needs || can(role, n.needs)) && (!n.feature || entitled(entitlements, n.feature)));
