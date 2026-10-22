import type { Role } from "./domain";

export type Capability =
  | "market.view" | "market.export" | "acquisition.review"
  | "inventory.view" | "inventory.edit" | "inventory.transition" | "inventory.bulk"
  | "price.view" | "price.propose" | "price.approve" | "price.floorException"
  | "campaign.view" | "campaign.edit" | "campaign.approve"
  | "leads.view" | "leads.edit" | "leads.contact" | "leads.merge" | "leads.export"
  | "capital.view" | "capital.correct" | "capital.scenario"
  | "alerts.view" | "alerts.act" | "alerts.rules"
  | "reports.view" | "reports.finance" | "reports.export" | "reports.schedule"
  | "settings.view" | "settings.admin" | "settings.integrations" | "settings.team" | "settings.keys" | "settings.audit";

const ALL: Capability[] = [
  "market.view", "market.export", "acquisition.review", "inventory.view", "inventory.edit", "inventory.transition", "inventory.bulk", "price.view", "price.propose", "price.approve", "price.floorException",
  "campaign.view", "campaign.edit", "campaign.approve", "leads.view", "leads.edit", "leads.contact", "leads.merge", "leads.export", "capital.view", "capital.correct", "capital.scenario",
  "alerts.view", "alerts.act", "alerts.rules", "reports.view", "reports.finance", "reports.export", "reports.schedule", "settings.view", "settings.admin", "settings.integrations", "settings.team", "settings.keys", "settings.audit",
];

/** Owner controls business, approvals and all permitted branches. Manager manages assigned branches. Inventory edits stock, not approval. Marketing drafts campaigns. Sales handles assigned leads. Finance sees ledgers. Viewer is read-only. */
const MATRIX: Record<Role, Capability[]> = {
  owner: ALL,
  manager: ["market.view", "market.export", "acquisition.review", "inventory.view", "inventory.edit", "inventory.transition", "inventory.bulk", "price.view", "price.propose", "price.approve", "campaign.view", "campaign.edit", "campaign.approve",
    "leads.view", "leads.edit", "leads.contact", "leads.merge", "leads.export", "capital.view", "capital.scenario", "alerts.view", "alerts.act", "alerts.rules", "reports.view", "reports.export", "reports.schedule", "settings.view"],
  inventory: ["market.view", "acquisition.review", "inventory.view", "inventory.edit", "inventory.transition", "inventory.bulk", "price.view", "price.propose", "campaign.view", "leads.view", "alerts.view", "alerts.act", "settings.view"],
  marketing: ["market.view", "inventory.view", "price.view", "campaign.view", "campaign.edit", "leads.view", "alerts.view", "alerts.act", "reports.view", "reports.export", "settings.view"],
  sales: ["market.view", "inventory.view", "price.view", "campaign.view", "leads.view", "leads.edit", "leads.contact", "alerts.view", "alerts.act", "settings.view"],
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
export const NAV: { key: string; label: string; short: string; href: string; icon: string; needs?: Capability }[] = [
  { key: "overview", label: "Command Centre", short: "Home", href: "/app/overview", icon: "grid" },
  { key: "market", label: "Market Radar", short: "Radar", href: "/app/market", icon: "radar", needs: "market.view" },
  { key: "inventory", label: "Inventory", short: "Stock", href: "/app/inventory", icon: "stock", needs: "inventory.view" },
  { key: "pricing", label: "Pricing Intelligence", short: "Pricing", href: "/app/pricing", icon: "tag", needs: "price.view" },
  { key: "advertising", label: "Advertising Studio", short: "Ads", href: "/app/advertising", icon: "megaphone", needs: "campaign.view" },
  { key: "leads", label: "Leads & customers", short: "Leads", href: "/app/leads", icon: "users", needs: "leads.view" },
  { key: "capital", label: "Capital & profit", short: "Capital", href: "/app/capital", icon: "coins" },
  { key: "alerts", label: "Alerts & actions", short: "Alerts", href: "/app/alerts", icon: "bell", needs: "alerts.view" },
  { key: "reports", label: "Reports & analytics", short: "Reports", href: "/app/reports", icon: "chart" },
  { key: "settings", label: "Settings", short: "Settings", href: "/app/settings/business", icon: "gear", needs: "settings.view" },
];
