import type { AuthenticatedPrincipal, Capability } from "@vandlabs/contracts";
import { tenantConfig } from "@vandlabs/demo-data";

function parseCsv(value: string | null) {
  return value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}

export function resolvePrincipal(request: Request): AuthenticatedPrincipal | null {
  if (process.env.AUTH_MODE !== "cognito") {
    return {
      userId: "demo-staff",
      tenantId: tenantConfig.tenantId,
      dealershipIds: [tenantConfig.activeDealershipId],
      locationIds: tenantConfig.organization.dealerships.flatMap((dealer) =>
        dealer.locations.map((location) => location.id),
      ),
      capabilities: [
        "inventory:read",
        "lead:read",
        "lead:write",
        "task:write",
        "analytics:read",
      ],
    };
  }

  // Production deployments must place verified Cognito claims into these
  // trusted upstream headers after JWT verification. Raw browser-supplied
  // values must never be trusted by the public origin.
  const userId = request.headers.get("x-vandlabs-user-id");
  const tenantId = request.headers.get("x-vandlabs-tenant-id");
  if (!userId || !tenantId) return null;

  return {
    userId,
    tenantId,
    dealershipIds: parseCsv(request.headers.get("x-vandlabs-dealership-ids")),
    locationIds: parseCsv(request.headers.get("x-vandlabs-location-ids")),
    capabilities: parseCsv(request.headers.get("x-vandlabs-capabilities")) as Capability[],
  };
}
