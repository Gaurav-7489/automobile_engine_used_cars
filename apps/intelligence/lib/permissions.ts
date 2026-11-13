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
  | "automations.view" | "automations.manage" | "subscription.view"
  | "finance.record" | "investors.view" | "investors.manage";

const ALL: Capability[] = [
  "market.view", "market.export", "acquisition.review", "inventory.view", "inventory.edit", "inventory.transition", "inventory.bulk", "price.view", "price.propose", "price.approve", "price.floorException",
  "campaign.view", "campaign.edit", "campaign.approve", "leads.view", "leads.edit", "leads.contact", "leads.merge", "leads.export", "capital.view", "capital.correct", "capital.scenario",
  "alerts.view", "alerts.act", "alerts.rules", "reports.view", "reports.finance", "reports.export", "reports.schedule", "settings.view", "settings.admin", "settings.integrations", "settings.team", "settings.keys", "settings.audit",
  "automations.view", "automations.manage", "subscription.view", "finance.record", "investors.view", "investors.manage",
];

/** Owner controls business, approvals and all permitted branches. Manager manages assigned branches. Inventory edits stock, not approval. Marketing drafts campaigns. Sales handles assigned leads. Finance sees ledgers. Viewer is read-only. */
const MATRIX: Record<Role, Capability[]> = {
  owner: ALL,
  manager: ["market.view", "market.export", "acquisition.review", "inventory.view", "inventory.edit", "inventory.transition", "inventory.bulk", "price.view", "price.propose", "price.approve", "campaign.view", "campaign.edit", "campaign.approve",
    "leads.view", "leads.edit", "leads.contact", "leads.merge", "leads.export", "capital.view", "capital.scenario", "alerts.view", "alerts.act", "alerts.rules", "reports.view", "reports.export", "reports.schedule", "settings.view", "automations.view", "automations.manage", "finance.record"],
  inventory: ["market.view", "acquisition.review", "inventory.view", "inventory.edit", "inventory.transition", "inventory.bulk", "price.view", "price.propose", "campaign.view", "leads.view", "alerts.view", "alerts.act", "settings.view", "automations.view"],
  marketing: ["market.view", "inventory.view", "price.view", "campaign.view", "campaign.edit", "leads.view", "alerts.view", "alerts.act", "reports.view", "reports.export", "settings.view", "automations.view"],
  sales: ["market.view", "inventory.view", "price.view", "campaign.view", "leads.view", "leads.edit", "leads.contact", "alerts.view", "alerts.act", "settings.view", "automations.view"],
  finance: ["market.view", "inventory.view", "price.view", "capital.view", "capital.correct", "capital.scenario", "alerts.view", "reports.view", "reports.finance", "reports.export", "reports.schedule", "settings.view", "finance.record", "investors.view", "investors.manage"],
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
/**
 * One sidebar entry per job. Pages that belong to the same job are not separate sidebar entries: they are tabs at the top of
 * their section (`parent`), so the sidebar stays short and everything still has one obvious place.
 */
export type NavItem = { key: string; label: string; short: string; href: string; icon: string; group: NavGroup; needs?: Capability; feature?: FeatureKey; parent?: string; tab?: string };
export const NAV: NavItem[] = [
  { key: "overview", label: "Overview", short: "Home", href: "/app/overview", icon: "grid", group: "Today", tab: "Today" },
  { key: "alerts", label: "Alerts & actions", short: "Alerts", href: "/app/alerts", icon: "bell", group: "Today", needs: "alerts.view", feature: "alerts", parent: "overview", tab: "Alerts" },
  { key: "assistant", label: "Assistant", short: "Ask", href: "/app/assistant", icon: "sparkle", group: "Today", feature: "assistant", parent: "overview" },
  { key: "inventory", label: "Inventory", short: "Stock", href: "/app/inventory", icon: "car", group: "Stock", needs: "inventory.view", feature: "inventory", tab: "Stock" },
  { key: "stock-intelligence", label: "Stock ageing", short: "Ageing", href: "/app/stock-intelligence", icon: "clock", group: "Stock", needs: "inventory.view", feature: "stock_intelligence", parent: "inventory", tab: "Ageing" },
  { key: "pricing", label: "Pricing", short: "Pricing", href: "/app/pricing", icon: "tag", group: "Stock", needs: "price.view", feature: "pricing" },
  { key: "market", label: "Market", short: "Market", href: "/app/market", icon: "radar", group: "Stock", needs: "market.view", feature: "market", tab: "Listings" },
  { key: "market-regions", label: "Prices by region", short: "Regions", href: "/app/market/regions", icon: "map", group: "Stock", needs: "market.view", feature: "market", parent: "market", tab: "By region" },
  { key: "state-prices", label: "Prices by state", short: "States", href: "/app/state-prices", icon: "columns", group: "Stock", needs: "market.view", parent: "market", tab: "By state" },
  { key: "acquisition", label: "Buying", short: "Buying", href: "/app/acquisition", icon: "map", group: "Stock", needs: "acquisition.review", feature: "acquisition" },
  { key: "leads", label: "Customers", short: "Leads", href: "/app/leads", icon: "users", group: "Sales", needs: "leads.view", feature: "leads", tab: "Leads" },
  { key: "conversations", label: "Conversations", short: "Chats", href: "/app/conversations", icon: "message", group: "Sales", needs: "leads.view", feature: "leads", parent: "leads", tab: "Conversations" },
  { key: "automations", label: "Follow-up rules", short: "Rules", href: "/app/automations", icon: "zap", group: "Sales", needs: "automations.view", feature: "automations", parent: "leads", tab: "Follow-up rules" },
  { key: "advertising", label: "Advertising", short: "Ads", href: "/app/advertising", icon: "megaphone", group: "Sales", needs: "campaign.view", feature: "advertising" },
  { key: "showroom", label: "Showroom", short: "Showroom", href: "/app/showroom", icon: "store", group: "Sales", needs: "inventory.view", feature: "inventory" },
  { key: "capital", label: "Money", short: "Money", href: "/app/capital", icon: "coins", group: "Business", needs: "capital.view", feature: "capital", tab: "Capital & profit" },
  { key: "revenue", label: "Revenue & expenses", short: "Revenue", href: "/app/revenue", icon: "chart", group: "Business", needs: "capital.view", feature: "capital", parent: "capital", tab: "Revenue & expenses" },
  { key: "investors", label: "Investors", short: "Investors", href: "/app/investors", icon: "users", group: "Business", needs: "investors.view", feature: "capital", parent: "capital", tab: "Investors" },
  { key: "reports", label: "Reports", short: "Reports", href: "/app/reports", icon: "chart", group: "Business", needs: "reports.view", feature: "reports" },
  { key: "settings", label: "Settings", short: "Settings", href: "/app/settings/business", icon: "gear", group: "Business", needs: "settings.view" },
];

const allowed = (n: NavItem, role: Role, entitlements: Entitlements | undefined) => (!n.needs || can(role, n.needs)) && (!n.feature || entitled(entitlements, n.feature));

/** The tabs at the top of a section: the section itself and its sub-pages the member may use. Empty when there is only one. */
export function sectionTabs(sectionKey: string, role: Role, entitlements: Entitlements | undefined): NavItem[] {
  const tabs = NAV.filter((n) => (n.key === sectionKey || n.parent === sectionKey) && n.tab && allowed(n, role, entitlements));
  return tabs.length > 1 ? tabs : [];
}

/** The page a path belongs to, and the sidebar section it sits under. */
export function navFor(pathname: string): { item: NavItem | undefined; section: string } {
  const base = (n: NavItem) => (n.key === "settings" ? "/app/settings" : n.href);
  const item = [...NAV].sort((a, b) => base(b).length - base(a).length).find((n) => pathname === base(n) || pathname.startsWith(`${base(n)}/`));
  return { item, section: item?.parent ?? item?.key ?? "overview" };
}

/** Navigation the signed-in member may use: allowed by role and included in the dealership's entitlements. */
export const visibleNav = (role: Role, entitlements: Entitlements | undefined) => NAV.filter((n) => !n.parent && allowed(n, role, entitlements));
