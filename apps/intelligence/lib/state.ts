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
};

export const STATE_VERSION = 3;

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
