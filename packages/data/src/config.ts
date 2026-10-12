import { tenantConfig as demoConfig } from "@vandlabs/demo-data";
import type { TenantConfig } from "@vandlabs/contracts";
import { productionTenantConfig } from "./tenant-input";
export function dataMode() {
  const mode = process.env.DATA_MODE;
  if (mode === "neon" || mode === "aurora" || mode === "demo") return mode;
  if (!mode && process.env.NODE_ENV !== "production") return "demo";
  throw new Error("DATA_MODE must explicitly select demo, neon or aurora.");
}
const configuredTenant: TenantConfig = process.env.TENANT_CONFIG_JSON ? productionTenantConfig(JSON.parse(process.env.TENANT_CONFIG_JSON)) : demoConfig;
const siteOrigin=process.env.SITE_ORIGIN;
if(siteOrigin && (new URL(siteOrigin).protocol !== "https:" || new URL(siteOrigin).origin !== siteOrigin))throw new Error("SITE_ORIGIN must be an HTTPS origin.");
export const tenantConfig: TenantConfig = siteOrigin ? {...configuredTenant,seo:{...configuredTenant.seo,canonicalBase:siteOrigin}} : configuredTenant;
export function publicScope() {
  if (dataMode() !== "demo" && (!process.env.TENANT_CONFIG_JSON || !tenantConfig.tenantId || !tenantConfig.activeDealershipId)) {
    throw new Error("Production dealership configuration is required.");
  }
  return { tenantId: tenantConfig.tenantId, dealershipId: tenantConfig.activeDealershipId };
}
