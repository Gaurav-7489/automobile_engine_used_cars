import type { Session } from "../domain";
import { alertCounts } from "../selectors";
import type { WorkspaceState } from "../state";
import { deriveTenantAlerts } from "./alerts-model";
import { tenantTx } from "./db";
import type { Principal } from "./identity";
import { syncReadModel } from "./read-model";
import { redactFor } from "./redact";
import { enterLive } from "./workspace";
import { readState } from "./workspace-store";

/**
 * What a page needs before it asks for records: tenant, branches, team, policy, integrations, small document collections and
 * the open-alert counts for each branch the member may see. Never any per-vehicle, per-lead or per-sale data.
 */
export async function buildShell(principal: Principal, session: Pick<Session, "role" | "branchIds">): Promise<WorkspaceState> {
  enterLive();
  const shell = await tenantTx(principal.tenantId, async (c) => {
    await syncReadModel(c, principal.tenantId);
    const base = await readState(c, principal.tenantId, { shell: true });
    const alerts = await deriveTenantAlerts(c, principal.tenantId, base);
    const counts: NonNullable<WorkspaceState["alertCounts"]> = {};
    for (const b of base.branches) counts[b.id] = alertCounts(alerts.filter((a) => a.branchId === b.id));
    return { ...base, audit: [], partial: true, alertCounts: counts } satisfies WorkspaceState;
  });
  return redactFor(shell, session);
}
