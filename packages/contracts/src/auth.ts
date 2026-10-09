export type Capability =
  | "inventory:read"
  | "inventory:write"
  | "lead:read"
  | "lead:write"
  | "task:write"
  | "analytics:read"
  | "capital:read"
  | "capital:write"
  | "platform:admin";

export interface AuthenticatedPrincipal {
  userId: string;
  tenantId: string;
  dealershipIds: string[];
  locationIds: string[];
  capabilities: Capability[];
  /** Server-provisioned platform scopes, never taken from JWT/custom headers. */
  platformTenantIds?: string[];
  assignedLeadOnly?: boolean;
}

export class AuthorizationError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function requireCapability(
  principal: AuthenticatedPrincipal,
  capability: Capability,
) {
  if (!principal.capabilities.includes(capability)) {
    throw new AuthorizationError();
  }
}

export function requireTenant(principal: AuthenticatedPrincipal, tenantId: string) {
  if (principal.tenantId !== tenantId) {
    throw new AuthorizationError("Tenant scope mismatch");
  }
}

export function requireDealership(principal: AuthenticatedPrincipal, dealershipId: string) {
  if (!principal.dealershipIds.includes(dealershipId)) {
    throw new AuthorizationError("Dealership scope mismatch");
  }
}

export function requireLocation(principal: AuthenticatedPrincipal, locationId: string) {
  if (!principal.locationIds.includes(locationId)) {
    throw new AuthorizationError("Location scope mismatch");
  }
}
