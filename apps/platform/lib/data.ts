import { tenantConfig } from "@vandlabs/demo-data";

export const tenantRegistry = [
  {
    tenantId: tenantConfig.tenantId,
    organizationId: tenantConfig.organization.id,
    organization: tenantConfig.organization.name,
    dealershipId: tenantConfig.activeDealershipId,
    dealership: "Apex Select Cars",
    locations: 2,
    domain: "apexselect.example",
    package: "Growth",
    status: "healthy",
    region: "ap-south-1",
    createdAt: "2026-09-20T10:00:00Z",
  },
];

export const onboardingSteps = [
  ["Organization", "complete", "Apex Automotive Group"],
  ["Dealership & locations", "complete", "Apex Select Cars · 2 locations"],
  ["Brand profile", "complete", "Typography, theme and experience profile"],
  ["Custom domain", "ready", "Waiting for production DNS verification"],
  ["Inventory source", "complete", "Demo dealer adapter · 14 canonical records"],
  ["Staff & permissions", "ready", "Cognito/RBAC contract prepared; demo auth only"],
  ["Contact channels", "complete", "Phone + WhatsApp click-to-chat"],
  ["Analytics", "complete", "Journey event contract enabled"],
  ["CRM defaults", "complete", "Automotive pipeline seeded"],
  ["Entitlements", "complete", tenantConfig.entitlements.join(", ")],
  ["SEO & launch QA", "ready", "Structured data and launch checklist prepared"],
] as const;

export const featureFlags = [
  { key: "experience.compare", rollout: "full", owner: "Experience", state: "on" },
  { key: "conversion.finance_intent", rollout: "full", owner: "Growth", state: "on" },
  { key: "conversion.exchange_intent", rollout: "full", owner: "Growth", state: "on" },
  { key: "intelligence.nl_search", rollout: "internal", owner: "AI Platform", state: "off" },
  { key: "crm.assistive_summary", rollout: "dark", owner: "CRM", state: "off" },
];

export const integrationAdapters = [
  { name: "Website BFF", category: "core", status: "healthy", mode: "local demo contract" },
  { name: "WhatsApp", category: "messaging", status: "click-to-chat", mode: "provider adapter ready" },
  { name: "Google / UTM", category: "acquisition", status: "healthy", mode: "first-party capture" },
  { name: "Meta", category: "acquisition", status: "contract-only", mode: "provider adapter later" },
  { name: "DMS / CRM", category: "inventory", status: "contract-only", mode: "future adapter" },
  { name: "Finance / valuation", category: "commerce", status: "contract-only", mode: "future adapter" },
];

export const healthSignals = [
  { system: "Experience", status: "healthy", detail: "Public routes and inventory contracts" },
  { system: "Conversion BFF", status: "healthy", detail: "Lead and event endpoints available" },
  { system: "Command Center", status: "healthy", detail: "Seeded CRM/operations surfaces" },
  { system: "Platform Control", status: "healthy", detail: "Tenant and rollout control surfaces" },
  { system: "Persistence", status: "demo", detail: "Mock adapter; Aurora connection intentionally deferred" },
  { system: "Authentication", status: "demo", detail: "Cognito contract planned; production auth intentionally deferred" },
];

export const auditEvents = [
  { at: "2026-09-29T09:55:00Z", actor: "VandLabs Support", action: "tenant.health.view", scope: "tenant-apex", result: "allowed" },
  { at: "2026-09-29T09:30:00Z", actor: "Platform Admin", action: "feature.rollout.review", scope: "experience.compare", result: "allowed" },
  { at: "2026-09-29T08:10:00Z", actor: "Onboarding", action: "inventory.sync.demo", scope: "dealer-select", result: "14 records" },
  { at: "2026-09-28T18:40:00Z", actor: "Platform Admin", action: "entitlement.verify", scope: "tenant-apex", result: "6 enabled" },
];

export const platformUsage = {
  tenants: tenantRegistry.length,
  dealerships: tenantRegistry.length,
  locations: tenantRegistry.reduce((sum, tenant) => sum + tenant.locations, 0),
  publishedVehicles: 14,
  storageGb: 0.18,
  aiCost: 0,
  failedJobs: 0,
};
