import type { Command } from "../actions/recorder";
import { executeCommands } from "../actions/registry";
import type { Fail } from "../actions/common";
import { setLive } from "../mode";
import { setAsOf } from "../time";
import type { WorkspaceState } from "../state";
import { tenantTx } from "./db";
import { issueInviteWith, revokeSessions, type Principal } from "./identity";
import { persist, readState } from "./workspace-store";

export function enterLive(): void {
  setLive(true);
  setAsOf(new Date().toISOString());
}

export async function loadWorkspace(principal: Principal): Promise<WorkspaceState> {
  enterLive();
  return tenantTx(principal.tenantId, (c) => readState(c, principal.tenantId));
}

export type Effects = { inviteLinks: { email: string; token: string; expiresAt: string }[]; sessionsRevoked: boolean };

export type RunOutcome = { ok: true; state: WorkspaceState; effects: Effects } | (Fail & { state: WorkspaceState });

/**
 * Applies a batch of commands to the tenant's authoritative state inside one tenant-scoped transaction.
 * The tenant is serialised with an advisory lock, so two people cannot interleave a read-modify-write.
 */
export async function runCommands(principal: Principal, commands: Command[], reauthenticated: boolean): Promise<RunOutcome> {
  enterLive();
  const actor = { sub: principal.userId, name: principal.name, role: principal.role, branchIds: principal.locationIds };
  return tenantTx(principal.tenantId, async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 7))", [principal.tenantId]);
    const before = await readState(c, principal.tenantId);
    const outcome = executeCommands(before, actor, commands, reauthenticated);
    if (!outcome.ok) return { ...outcome, state: before };
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
    // Invited team rows were created by the action as placeholders; the database read below is the truth.
    return { ok: true as const, state: await readState(c, principal.tenantId), effects };
  });
}

export { revokeSessions };
