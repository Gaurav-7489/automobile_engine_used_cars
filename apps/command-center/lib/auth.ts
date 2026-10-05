import { requireCapability, requireTenant, requireDealership, requireLocation } from "@vandlabs/contracts";
import { createPrincipalResolver } from "@vandlabs/server-auth";
import { tenantConfig } from "@vandlabs/demo-data";

export const resolvePrincipal = createPrincipalResolver({
  demoPrincipal: {
    userId: "demo-staff",
    tenantId: tenantConfig.tenantId,
    dealershipIds: [tenantConfig.activeDealershipId],
    locationIds: tenantConfig.organization.dealerships.flatMap((dealer) => dealer.locations.map((location) => location.id)),
    capabilities: ["inventory:read", "lead:read", "lead:write", "task:write", "analytics:read"],
  },
});

// The reference screens aggregate the full reference dealership. Until scoped
// repositories replace them, deny partial scopes rather than showing other locations.
export async function authorizeCommandPage(request: Request) {
  const principal = await resolvePrincipal(request);
  for (const capability of ["lead:read", "inventory:read", "analytics:read"] as const) {
    requireCapability(principal, capability);
  }
  requireTenant(principal, tenantConfig.tenantId);
  requireDealership(principal, tenantConfig.activeDealershipId);
  for (const dealer of tenantConfig.organization.dealerships) {
    if (dealer.id === tenantConfig.activeDealershipId) {
      for (const location of dealer.locations) requireLocation(principal, location.id);
    }
  }
}
