import { CognitoJwtVerifier } from "aws-jwt-verify";
import type { AuthenticatedPrincipal, Capability } from "@vandlabs/contracts";
import { tenantConfig } from "@vandlabs/demo-data";

const capabilitySet = new Set<Capability>([
  "inventory:read",
  "lead:read",
  "lead:write",
  "task:write",
  "analytics:read",
  "platform:admin",
]);

function listClaim(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function demoPrincipal(): AuthenticatedPrincipal {
  return {
    userId: "demo-staff",
    tenantId: tenantConfig.tenantId,
    dealershipIds: [tenantConfig.activeDealershipId],
    locationIds: tenantConfig.organization.dealerships.flatMap((dealer) =>
      dealer.locations.map((location) => location.id),
    ),
    capabilities: ["inventory:read", "lead:read", "lead:write", "task:write", "analytics:read"],
  };
}

export async function resolvePrincipal(request: Request): Promise<AuthenticatedPrincipal | null> {
  if (process.env.AUTH_MODE !== "cognito") return demoPrincipal();

  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;
  if (!userPoolId || !clientId) throw new Error("Cognito environment is incomplete.");

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return null;

  const verifier = CognitoJwtVerifier.create({
    userPoolId,
    tokenUse: "access",
    clientId,
  });
  const payload = await verifier.verify(token);
  const tenantId = typeof payload["custom:tenant_id"] === "string"
    ? payload["custom:tenant_id"]
    : null;
  if (!tenantId) return null;

  const capabilities = listClaim(payload["custom:capabilities"])
    .filter((item): item is Capability => capabilitySet.has(item as Capability));

  return {
    userId: payload.sub,
    tenantId,
    dealershipIds: listClaim(payload["custom:dealership_ids"]),
    locationIds: listClaim(payload["custom:location_ids"]),
    capabilities,
  };
}
