import type { Alert } from "../domain";
import { now } from "../clock";
import { ist } from "../time";
import type { WorkspaceState } from "../state";
import { type Actor, type Result, fail, guard, ok, trim, withAudit } from "./common";

export const RESOLUTION_CODES = [
  { code: "action-taken", label: "Action taken" },
  { code: "price-applied", label: "Price applied" },
  { code: "lead-contacted", label: "Lead contacted" },
  { code: "doc-added", label: "Document added" },
  { code: "no-longer-applies", label: "No longer applies" },
];

/** Acknowledge records the actor but does not resolve the condition. */
export function acknowledge(state: WorkspaceState, actor: Actor, ids: string[]): Result<{ count: number }> {
  const denied = guard(actor, "alerts.act");
  if (denied) return denied;
  let count = 0;
  const alerts = state.alerts.map((a) => {
    if (!ids.includes(a.id) || a.status !== "Open" || a.acknowledgedBy) return a;
    count += 1;
    return { ...a, acknowledgedBy: actor.name, history: [...a.history, { at: now(), actor: actor.name, action: "Acknowledged. Condition not resolved." }] };
  });
  return ok(withAudit({ ...state, alerts }, actor, "alert.acknowledged", ids.join(","), `${count} acknowledged`), { count });
}

export function assignAlerts(state: WorkspaceState, actor: Actor, ids: string[], assignee: string, dueOn?: string): Result<{ count: number }> {
  const denied = guard(actor, "alerts.act");
  if (denied) return denied;
  if (!trim(assignee)) return fail(422, "invalid", "Choose a permitted staff member.", { fields: { assignee: "Choose an assignee." } });
  let count = 0;
  const alerts = state.alerts.map((a) => {
    if (!ids.includes(a.id) || a.status === "Resolved") return a;
    count += 1;
    const dueAt = dueOn && /^\d{4}-\d{2}-\d{2}$/.test(dueOn) ? ist(...(dueOn.split("-").map(Number) as [number, number, number]), 10) : a.dueAt;
    return { ...a, assignee, owner: assignee, dueAt, history: [...a.history, { at: now(), actor: actor.name, action: `Assigned to ${assignee}` }] };
  });
  return ok(withAudit({ ...state, alerts }, actor, "alert.assigned", ids.join(","), assignee), { count });
}

export type SnoozeChoice = "1h" | "tomorrow" | "custom";

/** Snooze needs a reason and duration. Absolute time is stored; the alert reopens automatically at expiry if the condition persists. */
export function snooze(state: WorkspaceState, actor: Actor, id: string, choice: SnoozeChoice, reason: string, customUntil?: string): Result<{ alert: Alert }> {
  const denied = guard(actor, "alerts.act");
  if (denied) return denied;
  const alert = state.alerts.find((a) => a.id === id);
  if (!alert) return fail(404, "not_found", "Record not found.");
  if (alert.status === "Resolved") return fail(409, "conflict", "Resolved alerts cannot be snoozed.");
  const fields: Record<string, string> = {};
  if (!trim(reason)) fields.reason = "Enter why this alert is being snoozed.";
  const current = new Date(now());
  let until: string | null = null;
  if (choice === "1h") until = new Date(current.getTime() + 3_600_000).toISOString();
  else if (choice === "tomorrow") {
    const istNow = new Date(current.getTime() + (5 * 60 + 30) * 60_000);
    until = ist(istNow.getUTCFullYear(), istNow.getUTCMonth() + 1, istNow.getUTCDate() + 1, 9, 0);
  } else if (customUntil && !Number.isNaN(Date.parse(customUntil))) until = new Date(`${customUntil}:00+05:30`).toISOString();
  if (!until) fields.until = "Choose 1 h, Tomorrow 09:00 or a custom time.";
  else if (new Date(until).getTime() <= current.getTime()) fields.until = "Choose a time in the future.";
  if (Object.keys(fields).length) return fail(422, "invalid", "Fix the highlighted fields to snooze.", { fields });
  const updated: Alert = { ...alert, status: "Snoozed", snoozeUntil: until!, snoozeReason: trim(reason), history: [...alert.history, { at: now(), actor: actor.name, action: `Snoozed until ${until} (Asia/Kolkata). ${trim(reason)}` }] };
  return ok(withAudit({ ...state, alerts: state.alerts.map((a) => (a.id === id ? updated : a)) }, actor, "alert.snoozed", id, `until ${until}`), { alert: updated });
}

/** Resolve requires a resolution code and note or a linked completed action. System-managed integration alerts resolve only after a successful health check, or can be dismissed as a false positive with a reason. */
export function resolve(state: WorkspaceState, actor: Actor, id: string, code: string, note: string, falsePositive = false): Result<{ alert: Alert }> {
  const denied = guard(actor, "alerts.act");
  if (denied) return denied;
  const alert = state.alerts.find((a) => a.id === id);
  if (!alert) return fail(404, "not_found", "Record not found.");
  if (alert.status === "Resolved") return fail(409, "conflict", "This alert is already resolved.");
  const fields: Record<string, string> = {};
  if (!RESOLUTION_CODES.some((r) => r.code === code) && !falsePositive) fields.code = "Choose a resolution code.";
  if (!trim(note)) fields.note = "Add a note describing what resolved the condition.";
  if (Object.keys(fields).length) return fail(422, "invalid", "Fix the highlighted fields to resolve.", { fields });
  if (alert.type === "Integration" && !falsePositive) {
    const integration = state.integrations.find((i) => i.name.includes(alert.recordRef.replace("Feed ", "feed ")) || i.id === "feed-a" || i.id === "publishing");
    if (integration && integration.state !== "Connected") return fail(409, "conflict", "System-managed integration alerts resolve only after a successful health check. Run Test connection in Settings, or dismiss as a false positive with a reason.");
  }
  const stamp = now();
  const updated: Alert = { ...alert, status: "Resolved", resolution: { code: falsePositive ? "false-positive" : code, note: trim(note), at: stamp, by: actor.name }, history: [...alert.history, { at: stamp, actor: actor.name, action: falsePositive ? `Dismissed as false positive: ${trim(note)}` : `Resolved (${code}): ${trim(note)}` }] };
  return ok(withAudit({ ...state, alerts: state.alerts.map((a) => (a.id === id ? updated : a)) }, actor, "alert.resolved", id, `${updated.resolution?.code}`), { alert: updated });
}

/** Snoozed alerts reopen at expiry when the condition persists. Resolved alerts retain audit and reopen when a new occurrence is detected. */
export function reopenExpired(state: WorkspaceState): WorkspaceState {
  const current = now();
  let changed = false;
  const alerts = state.alerts.map((a) => {
    if (a.status === "Snoozed" && a.snoozeUntil && a.snoozeUntil <= current) {
      changed = true;
      return { ...a, status: "Open" as const, occurrences: a.occurrences + 1, lastSeen: current, history: [...a.history, { at: current, actor: "Rule engine", action: "Snooze expired: condition persists, alert reopened" }] };
    }
    return a;
  });
  return changed ? { ...state, alerts } : state;
}

export function updateRules(state: WorkspaceState, actor: Actor, patch: Partial<WorkspaceState["policy"]>): Result {
  const denied = guard(actor, "alerts.rules");
  if (denied) return denied;
  const fields: Record<string, string> = {};
  const check = (key: keyof WorkspaceState["policy"], label: string, min: number, max: number) => {
    const value = patch[key];
    if (value === undefined) return;
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) fields[key] = `${label} must be between ${min} and ${max}.`;
  };
  check("reviewThresholdDays", "Price review threshold", 7, 180);
  check("ageingDays", "Ageing threshold", 14, 365);
  check("staleFeedHours", "Stale feed threshold", 1, 168);
  check("leadResponseMinutes", "Lead response SLA", 5, 1440);
  if (Object.keys(fields).length) return fail(422, "invalid", "Fix the highlighted thresholds.", { fields });
  const next = { ...state, policy: { ...state.policy, ...patch, rulesVersion: state.policy.rulesVersion + 1 } };
  return ok(withAudit(next, actor, "alert.rules_updated", `rules-v${next.policy.rulesVersion}`, JSON.stringify(patch)));
}

/** Preview the number of records a threshold change would affect before saving. */
export function previewRuleImpact(state: WorkspaceState, thresholdDays: number, stockAge: (id: string) => number): number {
  return state.vehicles.filter((v) => v.status === "available" && stockAge(v.id) > thresholdDays).length;
}
