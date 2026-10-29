import type { Command } from "../actions/recorder";
import { executeCommands } from "../actions/registry";
import type { Fail } from "../actions/common";
import { setLive } from "../mode";
import { setAsOf } from "../time";
import type { WorkspaceState } from "../state";
import { tenantTx, type SqlClient } from "./db";
import { issueInviteWith, revokeSessions, type Principal } from "./identity";
import { persist, readState } from "./workspace-store";
import { syncReadModel } from "./read-model";
import { invalidateAlerts } from "./alerts-model";
import { enquiryContext } from "./read-queries";
import { needsOf, scopedState } from "./scoped-state";
import type { Alert, Lead, Sale, Vehicle } from "../domain";

export function enterLive(): void {
  setLive(true);
  setAsOf(new Date().toISOString());
}

export async function loadWorkspace(principal: Principal): Promise<WorkspaceState> {
  enterLive();
  return tenantTx(principal.tenantId, (c) => readState(c, principal.tenantId));
}

/** Small collections only: what every page needs before it asks for its own records. */
export async function loadShell(principal: Principal): Promise<WorkspaceState> {
  enterLive();
  return tenantTx(principal.tenantId, (c) => readState(c, principal.tenantId, { shell: true }));
}

export type Effects = { inviteLinks: { email: string; token: string; expiresAt: string }[]; sessionsRevoked: boolean };

/** Records a batch of commands created or changed, read back from the database after saving (never the browser's version). */
export type Changes = { vehicles: Vehicle[]; leads: Lead[]; sales: Sale[]; alerts: Alert[] };

export type RunOutcome = { ok: true; state: WorkspaceState; changes: Changes; effects: Effects } | (Fail & { state: WorkspaceState });

const changedIds = <T extends { id: string }>(before: readonly T[], after: readonly T[]): Set<string> => {
  const prev = new Map(before.map((x) => [x.id, JSON.stringify(x)]));
  const changed = new Set<string>();
  for (const x of after) if (prev.get(x.id) !== JSON.stringify(x)) changed.add(x.id);
  return changed;
};

/** The shell is the small collections only; the caller's pages hold the records they fetched. */
const asShell = (state: WorkspaceState): WorkspaceState => ({ ...state, vehicles: [], leads: [], sales: [], events: [], alerts: [], audit: [], partial: true });

/**
 * Applies a batch of commands to the tenant's authoritative state inside one tenant-scoped transaction.
 * The tenant is serialised with an advisory lock, so two people cannot interleave a read-modify-write.
 */
/**
 * The command pipeline inside an open tenant transaction. `mode: "full"` forces the whole-workspace read, which is how scoped
 * runs are verified against the reference.
 */
export async function runCommandsIn(c: SqlClient, principal: Principal, commands: Command[], reauthenticated: boolean, mode: "auto" | "full" = "auto", lap: (name: string) => void = () => undefined, trace: Record<string, number> = {}): Promise<RunOutcome> {
  const actor = { sub: principal.userId, name: principal.name, role: principal.role, branchIds: principal.locationIds };
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 7))", [principal.tenantId]);
  lap("lock");
  // Commands proven to depend only on the records they name run against just those records; any other command reads everything.
  const shellState = await readState(c, principal.tenantId, { shell: true });
  const needs = mode === "auto" ? needsOf(commands, shellState) : null;
  let before: WorkspaceState;
  if (needs) {
    await syncReadModel(c, principal.tenantId, { force: true });
    before = await scopedState(c, principal.tenantId, shellState, needs);
  } else {
    before = await readState(c, principal.tenantId);
  }
  trace.scoped = needs ? 1 : 0;
  lap("read");
  const outcome = executeCommands(before, actor, commands, reauthenticated);
  lap("execute");
  if (!outcome.ok) return { ...outcome, state: asShell(before) };
  const effects: Effects = { inviteLinks: [], sessionsRevoked: false };
  // Invitations become one-time links; the browser never creates accounts or tokens itself.
  const known = new Set(before.team.map((m) => m.id));
  for (const member of outcome.state.team) {
    if (known.has(member.id) || member.status !== "Invited") continue;
    const issued = await issueInviteWith(c, principal, { email: member.email, name: member.email.split("@")[0], role: member.role, locationIds: member.branchIds, dealershipIds: principal.dealershipIds });
    if (!issued.ok) throw new Error(issued.message);
    effects.inviteLinks.push({ email: member.email, token: issued.token, expiresAt: issued.expiresAt });
  }
  if (outcome.state.sessionsRevoked > before.sessionsRevoked) { await c.query("SELECT intelligence_revoke_sessions($1)", [principal.userId]); effects.sessionsRevoked = true; }
  await persist(c, principal, before, outcome.state, new Date().toISOString());
  lap("persist");
  // Invited team rows were created by the action as placeholders; the database read below is the truth.
  await syncReadModel(c, principal.tenantId, { force: true });
  lap("sync");
  invalidateAlerts(principal.tenantId);
  const changedVehicles = [...changedIds(before.vehicles, outcome.state.vehicles)];
  const changedLeads = [...changedIds(before.leads, outcome.state.leads)];
  const changedSales = [...changedIds(before.sales, outcome.state.sales)];
  const changedAlertIds = changedIds(before.alerts, outcome.state.alerts);
  const ctx = changedVehicles.length ? await enquiryContext(c, principal.tenantId) : null;
  const rows = async (table: string, key: string, ids: string[]) => (ids.length ? (await c.query(`SELECT data FROM ${table} WHERE tenant_id = $1 AND ${key} = ANY($2::text[])`, [principal.tenantId, ids])).rows.map((r) => r.data) : []);
  const changes: Changes = {
    vehicles: (await rows("intelligence_vehicle_index", "stock_id", changedVehicles) as Vehicle[]).map((v) => ({ ...v, enquiries14d: ctx?.byStock.get(v.id) ?? 0, cohortMedianEnquiries: ctx?.median ?? 0 })),
    leads: await rows("intelligence_lead_index", "lead_id", changedLeads) as Lead[],
    sales: await rows("intelligence_sale_index", "sale_id", changedSales) as Sale[],
    alerts: outcome.state.alerts.filter((a) => changedAlertIds.has(a.id)),
  };
  lap("changes");
  return { ok: true as const, state: await readState(c, principal.tenantId, { shell: true }).then((x) => asShell(x)), changes, effects };
}

export async function runCommands(principal: Principal, commands: Command[], reauthenticated: boolean): Promise<RunOutcome> {
  enterLive();
  const trace: Record<string, number> = {};
  let mark = performance.now();
  const lap = (name: string) => { const now = performance.now(); trace[name] = Math.round(now - mark); mark = now; };
  const outcomeOf = await tenantTx(principal.tenantId, (c) => runCommandsIn(c, principal, commands, reauthenticated, "auto", lap, trace));
  lap("commit");
  if (process.env.COMMAND_TRACE === "1") console.log(JSON.stringify({ event: "command_trace", commands: commands.map((c) => c.name), ms: trace }));
  return outcomeOf;
}

export { revokeSessions };
