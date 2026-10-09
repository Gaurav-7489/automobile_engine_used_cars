import { tenantConfig as demoConfig } from "@vandlabs/demo-data";
import type { TenantConfig } from "@vandlabs/contracts";
import { productionTenantConfig } from "./tenant-input";
export function dataMode() {
  const mode = process.env.DATA_MODE;
  if (mode === "aurora" || mode === "demo") return mode;
  if (!mode && process.env.NODE_ENV !== "production") return "demo";
  throw new Error("DATA_MODE must explicitly select demo or aurora.");
}
export const tenantConfig: TenantConfig = process.env.TENANT_CONFIG_JSON ? productionTenantConfig(JSON.parse(process.env.TENANT_CONFIG_JSON)) : demoConfig;
export function publicScope() {
  if (dataMode() === "aurora" && (!process.env.TENANT_CONFIG_JSON || !tenantConfig.tenantId || !tenantConfig.activeDealershipId)) {
    throw new Error("Production dealership configuration is required.");
  }
  return { tenantId: tenantConfig.tenantId, dealershipId: tenantConfig.activeDealershipId };
}
