import type { AuthenticatedPrincipal, Capability } from "./auth";

export const staffRoles = {
  owner: ["inventory:read", "inventory:write", "lead:read", "lead:write", "task:write", "analytics:read", "capital:read", "capital:write"],
  manager: ["inventory:read", "inventory:write", "lead:read", "lead:write", "task:write", "analytics:read"],
  sales: ["inventory:read", "lead:read", "lead:write", "task:write", "analytics:read"],
  viewer: ["inventory:read", "lead:read", "analytics:read"],
} as const satisfies Record<string, readonly Capability[]>;
export type StaffRole = keyof typeof staffRoles;

export interface StaffMember {
  userId: string;
  tenantId: string;
  displayName: string;
  role: StaffRole;
  dealershipIds: string[];
  locationIds: string[];
  enabled: boolean;
  version: number;
  updatedAt: string;
  updatedBy: string;
}
export interface PlatformAudit {
  id: string;
  tenantId: string;
  actor: string;
  action: string;
  subject: string;
  occurredAt: string;
  details: Record<string, unknown>;
}
export interface PlatformTenant {
  tenantId: string;
  organizationId: string;
  organization: string;
  dealerships: { id: string; name: string; locations: { id: string; name: string; city: string }[] }[];
  counts: { vehicles: number; publishedVehicles: number; leads: number; openTasks: number; sales: number };
  staff: StaffMember[];
  audit: PlatformAudit[];
}
export function staffPrincipal(member: StaffMember): AuthenticatedPrincipal {
  return { userId: member.userId, tenantId: member.tenantId, dealershipIds: [...member.dealershipIds],
    locationIds: [...member.locationIds], capabilities: [...staffRoles[member.role]], ...(member.role==="sales"?{assignedLeadOnly:true}:{}) };
}
