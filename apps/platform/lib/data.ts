import { tenantConfig, vehicles } from "@vandlabs/demo-data";
import { mergeRuntimeVehicles } from "@vandlabs/demo-data/runtime";

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
    status: "reference",
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
  { name: "Website BFF", category: "core", status: "implemented", mode: "Application routes; uptime not probed" },
  { name: "WhatsApp", category: "messaging", status: "click-to-chat", mode: "Provider delivery not configured" },
  { name: "Google / UTM", category: "acquisition", status: "implemented", mode: "first-party capture; external account not connected" },
  { name: "Meta", category: "acquisition", status: "contract-only", mode: "provider adapter later" },
  { name: "DMS / CRM", category: "inventory", status: "contract-only", mode: "future adapter" },
  { name: "Finance / valuation", category: "commerce", status: "contract-only", mode: "future adapter" },
];

export function runtimeHealth() {
  const production=process.env.DATA_MODE==="aurora";
  return [
    {system:"Persistence",status:production?"configured":"demo",detail:production?"Aurora adapter selected; connectivity and recovery not verified by this screen":"Atomic local reference state; not a production database"},
    {system:"Authentication",status:process.env.AUTH_MODE==="cognito"?"configured":"demo",detail:process.env.AUTH_MODE==="cognito"?"Cognito mode selected; live login acceptance is a separate gate":"Loopback reference identity"},
    {system:"Cloud monitoring",status:"unknown",detail:"No metrics collector connected to this screen"},
    {system:"AI provider",status:"unconfigured",detail:"No model inference or billing telemetry connected"},
    {system:"Market coverage",status:"unconfigured",detail:"No permissioned market data source connected"},
  ];
}
export function referenceUsage() {
  return {tenants:tenantRegistry.length,dealerships:tenantRegistry.length,locations:tenantRegistry.reduce((sum,t)=>sum+t.locations,0),publishedVehicles:mergeRuntimeVehicles(vehicles).filter(v=>v.tenantId===tenantConfig.tenantId&&v.dealershipId===tenantConfig.activeDealershipId&&v.publishStatus==="published").length,storageGb:null,aiCost:null,failedJobs:null};
}

export const auditEvents = [
  { at: "2026-09-29T09:55:00Z", actor: "VandLabs Support", action: "tenant.health.view", scope: "tenant-apex", result: "allowed" },
  { at: "2026-09-29T09:30:00Z", actor: "Platform Admin", action: "feature.rollout.review", scope: "experience.compare", result: "allowed" },
  { at: "2026-09-29T08:10:00Z", actor: "Onboarding", action: "inventory.sync.demo", scope: "dealer-select", result: "14 records" },
  { at: "2026-09-28T18:40:00Z", actor: "Platform Admin", action: "entitlement.verify", scope: "tenant-apex", result: "6 enabled" },
];
