import type { Alert, ApiKey, AuditEvent, Branch, Campaign, Integration, Lead, PriceRequest, Sale, InventoryEvent, SavedSearch, Scenario, AcquisitionReview, TeamMember, Vehicle } from "./domain";
import { BRANCHES, TENANT } from "./fixtures/branches";
import { ARCHIVED_STOCK, EVENTS, KOCHI_STOCK, KOZHIKODE_STOCK, SALES, THRISSUR_STOCK, soldVehicles } from "./fixtures/inventory";
import { ALERTS, API_KEYS, AUDIT, CAMPAIGNS, INTEGRATIONS, LEADS, PRICE_REQUESTS, TEAM } from "./fixtures/workspace";
import { lakh } from "./format";

export type Policy = {
  distinctApprover: boolean;
  reviewThresholdDays: number;
  ageingDays: number;
  staleFeedHours: number;
  leadResponseMinutes: number;
  evidenceExpiryDays: number;
  priceFloorPercent: number; // asking floor as % of landed cost
  rulesVersion: number;
};

export type WorkspaceState = {
  /** True when the state was read from the tenant database. Nothing in a live state is generated. */
  live?: boolean;
  version: number;
  tenant: { id: string; name: string; legalName: string; gstin: string; displayName: string; timezone: string };
  branches: Branch[];
  vehicles: Vehicle[];
  sales: Sale[];
  events: InventoryEvent[];
  leads: Lead[];
  alerts: Alert[];
  priceRequests: PriceRequest[];
  campaigns: Campaign[];
  integrations: Integration[];
  team: TeamMember[];
  apiKeys: ApiKey[];
  audit: AuditEvent[];
  watchlist: string[];
  savedSearches: SavedSearch[];
  scenarios: Scenario[];
  reviews: AcquisitionReview[];
  contactIntents: { listingId: string; at: string; by: string }[];
  corrections: { id: string; saleId: string; reason: string; evidence: string; proposedBy: string; at: string; status: "Proposed" }[];
  policy: Policy;
  notifications: Record<string, boolean>;
  sessionsRevoked: number;
  reportSchedules: { id: string; report: string; recipients: string[]; cadence: string; timezone: string; startDate: string }[];
  savedViews: { id: string; name: string; query: string }[];
  /**
   * Live workspaces load only the small collections up front. `vehicles`, `leads`, `sales` and `alerts` then hold just the records
   * the visible pages have fetched, and `events` is not used. Open-alert counts per permitted branch come from the server.
   */
  partial?: boolean;
  alertCounts?: Record<string, { critical: number; dueToday: number; overdue: number; waiting: number; open: number }>;
};

export const STATE_VERSION = 3;

/** Honest starting integrations: nothing external is connected until credentials exist and a real health check passes. */
function productionIntegrations(): Integration[] {
  const none = { lastSuccessAt: null, received: 0, rejected: 0, lastJob: "—", logs: [], cadence: "—", freshnessSla: "—", branchScope: "All branches" };
  return [
    { id: "feed-a", name: "Licensed market feed", kind: "Licensed feed", state: "Not configured", scopes: "Read licensed listings. No writes to the provider.", detail: "Setup required: no licensed market-data provider is connected, so Market Radar and valuations are unavailable.", ...none },
    { id: "ads", name: "Advertising account", kind: "Advertising account", state: "Not configured", scopes: "Create and pause campaigns within the approved spend cap.", detail: "Setup required: connect an advertising account to publish campaigns.", ...none },
    { id: "publishing", name: "Inventory publishing", kind: "Inventory publishing", state: "Connected", scopes: "Publish approved vehicle and price updates to the owned website.", detail: "The owned website reads published stock from the shared database. Marketplace publishing is not configured.", ...none },
  ];
}

/** Empty live workspace shell. readState fills it from the database; every collection starts empty and nothing is invented. */
export function buildProductionState(): WorkspaceState {
  return {
    live: true,
    version: STATE_VERSION,
    tenant: { id: "", name: "", legalName: "", gstin: "", displayName: "", timezone: "Asia/Kolkata" },
    branches: [], vehicles: [], sales: [], events: [], leads: [], alerts: [], priceRequests: [], campaigns: [], integrations: productionIntegrations(), team: [], apiKeys: [], audit: [],
    watchlist: [], savedSearches: [], scenarios: [], reviews: [], contactIntents: [], corrections: [],
    policy: { distinctApprover: true, reviewThresholdDays: 30, ageingDays: 45, staleFeedHours: 24, leadResponseMinutes: 60, evidenceExpiryDays: 7, priceFloorPercent: 102, rulesVersion: 1 },
    notifications: { "alerts.critical": true, "alerts.approvals": true, "leads.assigned": true, "reports.ready": false, "security.notices": true },
    sessionsRevoked: 0, reportSchedules: [], savedViews: [],
  };
}

export function buildSeed(): WorkspaceState {
  return {
    version: STATE_VERSION,
    tenant: { id: TENANT.id, name: TENANT.name, legalName: TENANT.legalName, gstin: "", displayName: TENANT.name, timezone: "Asia/Kolkata" },
    branches: BRANCHES.map((b) => ({ ...b })),
    vehicles: [...KOCHI_STOCK, ...THRISSUR_STOCK, ...KOZHIKODE_STOCK, ...ARCHIVED_STOCK, ...soldVehicles()].map((v) => ({ ...v, costs: { ...v.costs }, documents: v.documents.map((d) => ({ ...d })), channels: [...v.channels] })),
    sales: SALES.map((s) => ({ ...s })),
    events: EVENTS.map((e) => ({ ...e })),
    leads: LEADS.map((l) => structuredClone(l)),
    alerts: ALERTS.map((x) => structuredClone(x)),
    priceRequests: PRICE_REQUESTS.map((x) => structuredClone(x)),
    campaigns: CAMPAIGNS.map((x) => structuredClone(x)),
    integrations: INTEGRATIONS.map((x) => structuredClone(x)),
    team: TEAM.map((x) => ({ ...x })),
    apiKeys: API_KEYS.map((x) => ({ ...x })),
    audit: AUDIT.map((x) => ({ ...x })),
    watchlist: ["M-502"],
    savedSearches: [{ id: "ss-1", name: "BMW 520d Luxury Line / Kochi", query: "q=BMW+520d+Luxury+Line", cadence: "Weekly", createdAt: "2026-10-12T05:00:00.000Z" }],
    scenarios: [],
    reviews: [],
    contactIntents: [],
    corrections: [],
    policy: { distinctApprover: true, reviewThresholdDays: 30, ageingDays: 45, staleFeedHours: 24, leadResponseMinutes: 60, evidenceExpiryDays: 7, priceFloorPercent: 102, rulesVersion: 1 },
    notifications: { "alerts.critical": true, "alerts.approvals": true, "leads.assigned": true, "reports.ready": false, "security.notices": true },
    sessionsRevoked: 0,
    reportSchedules: [],
    savedViews: [],
  };
}

/** A tenant with no stock, leads or feeds: used to exercise the data-absent acceptance scenario (T01). */
export function buildEmptySeed(): WorkspaceState {
  const seed = buildSeed();
  return {
    ...seed, vehicles: [], sales: [], events: [], leads: [], alerts: [], priceRequests: [], campaigns: [], savedSearches: [], watchlist: [], audit: [],
    integrations: seed.integrations.map((i) => ({ ...i, state: "Not configured", lastSuccessAt: null, detail: "Connect to begin", logs: [], received: 0, rejected: 0, lastJob: "—" })),
  };
}

export const DEMO_APPROVAL_FLOOR = lakh(0);
