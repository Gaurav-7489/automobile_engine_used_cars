export type Capability =
  | "inventory:read"
  | "lead:read"
  | "lead:write"
  | "task:write"
  | "analytics:read"
  | "platform:admin";

export interface AuthenticatedPrincipal {
  userId: string;
  tenantId: string;
  dealershipIds: string[];
  locationIds: string[];
  capabilities: Capability[];
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
