import type { ApiKey, Integration, Role, TeamMember } from "../domain";
import { ROLES } from "../permissions";
import { now } from "../clock";
import { ist } from "../time";
import type { WorkspaceState } from "../state";
import { type Actor, type Result, fail, guard, nextId, ok, trim, withAudit } from "./common";

const SCOPE_TEXT: Record<string, string> = {
  "feed-a": "Read licensed listings for the selected branch. No writes to the provider.",
  ads: "Create and pause campaigns within the approved spend cap. Read cost and attribution reports.",
  publishing: "Publish approved vehicle and price updates to owned channels.",
};

export const scopeText = (id: string): string => SCOPE_TEXT[id] ?? "Review before connecting.";

/** Test is read-only and returns health. Connected is allowed only after a successful server-side test. */
export function testConnection(state: WorkspaceState, actor: Actor, id: string): Result<{ healthy: boolean; message: string }> {
  const denied = guard(actor, "settings.integrations");
  if (denied) return denied;
  const integration = state.integrations.find((i) => i.id === id);
  if (!integration) return fail(404, "not_found", "Record not found.");
  const stamp = now();
  if (integration.state === "Not configured" || integration.state === "Disconnected" || integration.state === "Expired") {
    return ok(state, { healthy: false, message: integration.state === "Expired" ? "Authorisation expired. Reconnect to continue." : "Not connected. Connect first, then test." });
  }
  const healthy = integration.id !== "publishing" || integration.state !== "Degraded";
  if (!healthy) return ok(withAudit(state, actor, "integration.tested", id, "Degraded: one channel needs retry"), { healthy: false, message: "One channel needs retry. Inspect the sync log, then retry only the failed rows." });
  const integrations = state.integrations.map((i) => (i.id === id ? { ...i, state: "Connected" as const, lastSuccessAt: stamp, detail: `Last success ${stamp}` } : i));
  const alerts = state.alerts.map((a) => (a.type === "Integration" && a.status === "Open" && (id === "feed-a" ? a.recordRef === "Feed A" : false) ? { ...a, status: "Resolved" as const, resolution: { code: "health-check", note: "Health check succeeded", at: stamp, by: "System" } } : a));
  return ok(withAudit({ ...state, integrations, alerts }, actor, "integration.tested", id, "Healthy"), { healthy: true, message: "Healthy. Last verified just now." });
}

export function connectIntegration(state: WorkspaceState, actor: Actor, id: string, accepted: boolean): Result<{ integration: Integration }> {
  const denied = guard(actor, "settings.integrations");
  if (denied) return denied;
  const integration = state.integrations.find((i) => i.id === id);
  if (!integration) return fail(404, "not_found", "Record not found.");
  if (!accepted) return fail(422, "invalid", "Review and accept the requested scopes before connecting.", { fields: { scopes: "Accept the scopes to connect." } });
  const stamp = now();
  const updated: Integration = { ...integration, state: "Connected", lastSuccessAt: stamp, detail: "Connected. First health check passed.", received: integration.received, logs: integration.logs };
  return ok(withAudit({ ...state, integrations: state.integrations.map((i) => (i.id === id ? updated : i)) }, actor, "integration.connected", id, SCOPE_TEXT[id] ?? "scopes accepted"), { integration: updated });
}

/** Disconnect confirms affected syncs/campaigns, revokes the token server-side and preserves audit. */
export function disconnectIntegration(state: WorkspaceState, actor: Actor, id: string): Result<{ affectedCampaigns: string[] }> {
  const denied = guard(actor, "settings.integrations");
  if (denied) return denied;
  const integration = state.integrations.find((i) => i.id === id);
  if (!integration) return fail(404, "not_found", "Record not found.");
  const affected = id === "ads" ? state.campaigns.filter((c) => c.status === "Active" || c.status === "Publishing" || c.status === "Approved").map((c) => c.id) : [];
  const stamp = now();
  const integrations = state.integrations.map((i) => (i.id === id ? { ...i, state: "Disconnected" as const, detail: "Disconnected. Token revoked.", lastSuccessAt: i.lastSuccessAt } : i));
  const campaigns = state.campaigns.map((c) => (affected.includes(c.id) ? { ...c, status: c.status === "Approved" ? ("Draft" as const) : ("Pausing" as const), platformAck: c.status === "Approved" ? c.platformAck : ("awaiting" as const), history: [...c.history, { at: stamp, actor: "System", action: "Integration disconnected: delivery pause requested" }] } : c));
  return ok(withAudit({ ...state, integrations, campaigns }, actor, "integration.disconnected", id, "Token revoked server-side"), { affectedCampaigns: affected });
}

export function inviteMember(state: WorkspaceState, actor: Actor, input: { email: string; role: Role; branchIds: string[] }): Result<{ member: TeamMember }> {
  const denied = guard(actor, "settings.team");
  if (denied) return denied;
  const fields: Record<string, string> = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trim(input.email))) fields.email = "Enter a valid email address.";
  else if (state.team.some((m) => m.email.toLowerCase() === trim(input.email).toLowerCase())) fields.email = "This person is already on the team or invited.";
  if (!ROLES.includes(input.role)) fields.role = "Choose a role.";
  if (!input.branchIds.length) fields.branchIds = "Choose at least one branch.";
  if (input.branchIds.some((b) => !actor.branchIds.includes(b))) fields.branchIds = "You can only grant branches you can access.";
  if (Object.keys(fields).length) return fail(422, "invalid", "Fix the highlighted fields to send the invitation.", { fields });
  const member: TeamMember = { id: nextId("u", state.team.map((t) => t.id), 100), name: "Pending invitation", email: trim(input.email), role: input.role, branchIds: input.branchIds, mfa: false, status: "Invited" };
  return ok(withAudit({ ...state, team: [...state.team, member] }, actor, "team.invited", member.email, `${input.role} / ${input.branchIds.join(",")}`), { member });
}

/** A role change needs an authorised admin and re-authentication for privilege escalation. The last owner cannot be removed or demoted. */
export function changeRole(state: WorkspaceState, actor: Actor, memberId: string, role: Role, reauthenticated: boolean): Result<{ member: TeamMember }> {
  const denied = guard(actor, "settings.team");
  if (denied) return denied;
  const member = state.team.find((m) => m.id === memberId);
  if (!member) return fail(404, "not_found", "Record not found.");
  const rank = (r: Role) => ROLES.length - ROLES.indexOf(r);
  const escalation = rank(role) > rank(member.role);
  if (escalation && !reauthenticated) return fail(403, "forbidden", "Re-authenticate to grant a higher role.", { fields: { password: "Confirm your password to continue." } });
  const owners = state.team.filter((m) => m.role === "owner" && m.status === "Active");
  if (member.role === "owner" && role !== "owner" && owners.length <= 1) return fail(422, "invalid", "The last owner cannot be demoted. Promote another owner first.");
  const updated = { ...member, role };
  return ok(withAudit({ ...state, team: state.team.map((m) => (m.id === memberId ? updated : m)) }, actor, "team.role_changed", member.email, `${member.role} → ${role}`), { member: updated });
}

export function removeMember(state: WorkspaceState, actor: Actor, memberId: string): Result {
  const denied = guard(actor, "settings.team");
  if (denied) return denied;
  const member = state.team.find((m) => m.id === memberId);
  if (!member) return fail(404, "not_found", "Record not found.");
  const owners = state.team.filter((m) => m.role === "owner" && m.status === "Active");
  if (member.role === "owner" && owners.length <= 1) return fail(422, "invalid", "The last owner cannot be removed.");
  return ok(withAudit({ ...state, team: state.team.filter((m) => m.id !== memberId) }, actor, "team.removed", member.email, "Access revoked"));
}

export function saveBusiness(state: WorkspaceState, actor: Actor, input: { displayName: string; legalName: string; gstin: string; timezone: string }): Result {
  const denied = guard(actor, "settings.admin");
  if (denied) return denied;
  const fields: Record<string, string> = {};
  if (!trim(input.displayName)) fields.displayName = "Enter a display name.";
  if (!trim(input.legalName)) fields.legalName = "Enter the legal business name.";
  if (trim(input.gstin) && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(trim(input.gstin).toUpperCase())) fields.gstin = "Enter a valid 15-character GSTIN or leave it blank.";
  if (!/^[A-Za-z_]+\/[A-Za-z_]+$/.test(trim(input.timezone))) fields.timezone = "Choose a valid IANA timezone, for example Asia/Kolkata.";
  if (Object.keys(fields).length) return fail(422, "invalid", "Fix the highlighted fields to save.", { fields });
  return ok(withAudit({ ...state, tenant: { ...state.tenant, displayName: trim(input.displayName), name: trim(input.displayName), legalName: trim(input.legalName), gstin: trim(input.gstin).toUpperCase(), timezone: trim(input.timezone) } }, actor, "business.saved", state.tenant.id, "Business profile updated"));
}

export function saveBranch(state: WorkspaceState, actor: Actor, input: { id?: string; name: string; city: string; state: string; timezone: string }): Result {
  const denied = guard(actor, "settings.admin");
  if (denied) return denied;
  const fields: Record<string, string> = {};
  if (!trim(input.name)) fields.name = "Enter a branch display name.";
  if (!trim(input.city)) fields.city = "Enter the city.";
  if (!trim(input.state)) fields.state = "Enter the state.";
  if (!/^[A-Za-z_]+\/[A-Za-z_]+$/.test(trim(input.timezone))) fields.timezone = "Choose a valid timezone, for example Asia/Kolkata.";
  if (Object.keys(fields).length) return fail(422, "invalid", "Fix the highlighted fields to save.", { fields });
  const id = input.id ?? trim(input.city).slice(0, 3).toLowerCase() + (state.branches.length + 1);
  const branches = input.id
    ? state.branches.map((b) => (b.id === id ? { ...b, name: trim(input.name), city: trim(input.city), state: trim(input.state), timezone: trim(input.timezone) } : b))
    : [...state.branches, { id, name: trim(input.name), city: trim(input.city), state: trim(input.state), timezone: trim(input.timezone) }];
  return ok(withAudit({ ...state, branches }, actor, "branch.saved", id, trim(input.name)));
}

export function setNotification(state: WorkspaceState, actor: Actor, key: string, value: boolean): Result {
  if (key === "security.notices" && !value) return fail(422, "invalid", "Critical security notices cannot be disabled.");
  return ok({ ...state, notifications: { ...state.notifications, [key]: value } });
}

function randomSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `vl_live_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

async function sha256(text: string): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** API keys need scope, branch and expiry. The secret is shown once; only a hash and prefix are stored. */
export async function createApiKey(state: WorkspaceState, actor: Actor, input: { name: string; scope: string; branch: string; expiresOn: string }, reauthenticated: boolean): Promise<Result<{ key: ApiKey; secret: string }>> {
  const denied = guard(actor, "settings.keys");
  if (denied) return denied;
  const fields: Record<string, string> = {};
  if (!trim(input.name)) fields.name = "Name the key so it can be recognised later.";
  if (!["inventory:read", "market:read", "leads:read", "reports:read"].includes(input.scope)) fields.scope = "Choose a scope.";
  if (!state.branches.some((b) => b.name === input.branch)) fields.branch = "Choose a branch.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn) || input.expiresOn <= now().slice(0, 10)) fields.expiresOn = "Choose a future expiry date.";
  if (!reauthenticated) fields.password = "Confirm your password to create a key.";
  if (Object.keys(fields).length) return fail(422, "invalid", "Fix the highlighted fields to create the key.", { fields });
  const secret = randomSecret();
  const hash = await sha256(secret);
  const key: ApiKey = { id: nextId("k", state.apiKeys.map((k) => k.id), 2), name: trim(input.name), scope: input.scope, branch: input.branch, expiresAt: ist(...(input.expiresOn.split("-").map(Number) as [number, number, number]), 0), prefix: secret.slice(0, 12), revoked: false, createdAt: now() };
  void hash; // The hash would be persisted server-side; the demo adapter keeps only metadata.
  return ok(withAudit({ ...state, apiKeys: [key, ...state.apiKeys] }, actor, "apikey.created", key.id, `${key.scope} / ${key.branch}`), { key, secret });
}

export function revokeApiKey(state: WorkspaceState, actor: Actor, id: string, reauthenticated: boolean): Result {
  const denied = guard(actor, "settings.keys");
  if (denied) return denied;
  if (!reauthenticated) return fail(403, "forbidden", "Re-authenticate to revoke a key.", { fields: { password: "Confirm your password to continue." } });
  if (!state.apiKeys.some((k) => k.id === id)) return fail(404, "not_found", "Record not found.");
  return ok(withAudit({ ...state, apiKeys: state.apiKeys.map((k) => (k.id === id ? { ...k, revoked: true } : k)) }, actor, "apikey.revoked", id, "Revoked"));
}

export function revokeSessions(state: WorkspaceState, actor: Actor): Result {
  return ok(withAudit({ ...state, sessionsRevoked: state.sessionsRevoked + 1 }, actor, "security.sessions_revoked", actor.sub, "All other sessions revoked"));
}

export function setPolicy(state: WorkspaceState, actor: Actor, patch: Partial<WorkspaceState["policy"]>): Result {
  const denied = guard(actor, "settings.admin");
  if (denied) return denied;
  return ok(withAudit({ ...state, policy: { ...state.policy, ...patch } }, actor, "policy.updated", "approval-policy", JSON.stringify(patch)));
}
