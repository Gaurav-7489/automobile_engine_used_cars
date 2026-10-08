import { requireCapability, requireTenant, requireDealership } from "@vandlabs/contracts";
import { createPrincipalResolver } from "@vandlabs/server-auth";
import { tenantConfig } from "@vandlabs/data";

const principalResolver = createPrincipalResolver({
  demoPrincipal: {
    userId: "demo-staff",
    tenantId: tenantConfig.tenantId,
    dealershipIds: [tenantConfig.activeDealershipId],
    locationIds: tenantConfig.organization.dealerships.flatMap((dealer) => dealer.locations.map((location) => location.id)),
    capabilities: ["inventory:read", "inventory:write", "lead:read", "lead:write", "task:write", "analytics:read"],
  },
});

export async function resolvePrincipal(request: Request) {
  const principal = await principalResolver(request);
  requireTenant(principal, tenantConfig.tenantId);
  requireDealership(principal, tenantConfig.activeDealershipId);
  return principal;
}

export async function authorizeCommandPage(request: Request) {
  const principal = await resolvePrincipal(request);
  for (const capability of ["lead:read", "inventory:read", "analytics:read"] as const) requireCapability(principal, capability);
}
