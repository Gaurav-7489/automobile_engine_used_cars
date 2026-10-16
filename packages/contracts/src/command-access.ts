import { AuthorizationError, type AuthenticatedPrincipal, type Capability } from "./auth";

// The same policy controls navigation and protected page entry. APIs still enforce
// their own resource-level scope; hiding a menu item is never authorization.
export const commandSections: readonly { label: string; path: string; capabilities: readonly Capability[] }[] = [
  {label:"Overview",path:"/",capabilities:["lead:read"]},
  {label:"Market",path:"/market",capabilities:["analytics:read"]},
  {label:"Acquisition",path:"/acquisition",capabilities:["capital:read"]},
  {label:"Subscriptions",path:"/subscriptions",capabilities:["commerce:manage"]},
  {label:"Data sources",path:"/data-sources",capabilities:["analytics:read"]},
  {label:"Business API",path:"/developer",capabilities:["commerce:manage"]},
  {label:"Leads",path:"/leads",capabilities:["lead:read"]},
  {label:"Pipeline",path:"/pipeline",capabilities:["lead:read"]},
  {label:"Tasks",path:"/tasks",capabilities:["lead:read"]},
  {label:"Appointments",path:"/appointments",capabilities:["lead:read"]},
  {label:"Inventory",path:"/inventory",capabilities:["inventory:read"]},
  {label:"Customers",path:"/customers",capabilities:["lead:read"]},
  {label:"Analytics",path:"/analytics",capabilities:["lead:read","analytics:read"]},
  {label:"Intelligence",path:"/intelligence",capabilities:["lead:read","analytics:read"]},
  {label:"Capital",path:"/capital",capabilities:["capital:read","lead:read"]},
  {label:"Automation",path:"/automation",capabilities:["lead:read","task:write"]},
  {label:"Settings",path:"/settings",capabilities:["lead:read"]},
];
export function commandCapabilities(path: string): readonly Capability[] {
  try { path = decodeURIComponent(path); } catch { throw new AuthorizationError(); }
  const local = path === "/command" ? "/" : path.startsWith("/command/") ? path.slice(8) : path;
  const section = commandSections.find(s => s.path === "/" ? local === "/" : local === s.path || local.startsWith(s.path + "/"));
  // The root page performs a role-specific redirect for staff without CRM access.
  if (local === "/") return ["inventory:read", "analytics:read"];
  // Unmapped paths keep the pre-role-isolation baseline. A new page must be added to
  // commandSections before narrower roles can reach it; never default to open.
  return ["inventory:read", "analytics:read", ...(section?.capabilities ?? ["lead:read"])];
}
export function commandNavigation(principal: AuthenticatedPrincipal) {
  if (!(["inventory:read", "analytics:read"] as const).every(cap => principal.capabilities.includes(cap))) return [];
  return commandSections.filter(section => section.capabilities.every(cap => principal.capabilities.includes(cap)))
    .map(section => [section.label, section.path] as const);
}
export function commandLanding(principal: Pick<AuthenticatedPrincipal, "capabilities">) {
  return principal.capabilities.includes("lead:read") ? "/command" : principal.capabilities.includes("capital:read") ? "/command/acquisition" : "/command/market";
}

export function requireCommandPage(principal: Pick<AuthenticatedPrincipal, "capabilities">, path: string) {
  if (!commandCapabilities(path).every(capability => principal.capabilities.includes(capability))) throw new AuthorizationError();
}
