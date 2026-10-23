import type { Session } from "../domain";
import { can } from "../permissions";
import type { WorkspaceState } from "../state";

/** The browser only ever receives records for the branches and capabilities of the signed-in member. */
export function redactFor(state: WorkspaceState, session: Pick<Session, "role" | "branchIds">): WorkspaceState {
  const allowed = new Set(session.branchIds);
  const inBranch = <T extends { branchId: string }>(items: T[]) => items.filter((i) => allowed.has(i.branchId));
  const vehicles = inBranch(state.vehicles);
  const vehicleIds = new Set(vehicles.map((v) => v.id));
  const canContact = can(session.role, "leads.contact");
  return {
    ...state,
    branches: state.branches.filter((b) => allowed.has(b.id)),
    vehicles,
    sales: inBranch(state.sales),
    events: inBranch(state.events),
    leads: inBranch(state.leads).map((l) => (canContact ? l : { ...l, contactFull: l.contactMasked, email: undefined })),
    alerts: inBranch(state.alerts),
    priceRequests: state.priceRequests.filter((r) => vehicleIds.has(r.vehicleId)),
    campaigns: state.campaigns.filter((c) => vehicleIds.has(c.vehicleId)),
    team: can(session.role, "settings.team") ? state.team : state.team.map((m) => ({ ...m, email: "" })),
    apiKeys: can(session.role, "settings.keys") ? state.apiKeys : [],
    audit: can(session.role, "settings.audit") ? state.audit : [],
    corrections: can(session.role, "capital.view") ? state.corrections : [],
  };
}
