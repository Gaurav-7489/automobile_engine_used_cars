import type { Alert } from "./domain";
import { needsPriceReview, stockAgeDays } from "./finance";
import { daysBetween } from "./format";
import type { WorkspaceState } from "./state";

const dueLabel = (dueAt: string | null, nowIso: string): string => {
  if (!dueAt) return "—";
  const diff = daysBetween(nowIso, dueAt);
  if (new Date(dueAt).getTime() < new Date(nowIso).getTime()) return "Overdue";
  return diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : `In ${diff} d`;
};

type Candidate = Pick<Alert, "id" | "type" | "severity" | "title" | "recordRef" | "recordKind" | "trigger" | "dueAt" | "actionLabel" | "branchId"> & { waiting?: boolean; owner: string };

/**
 * Alerts are computed from the workspace's real records and the policy thresholds. A persisted alert keeps its
 * acknowledgement, snooze and resolution; a condition that no longer holds closes an open alert.
 */
export function deriveAlerts(state: WorkspaceState, nowIso: string): Alert[] {
  const out: Candidate[] = [];
  const leadOwner = (l: { owner: string }) => l.owner;
  for (const v of state.vehicles) {
    if (v.status === "sold" || v.status === "archived") continue;
    const age = stockAgeDays(v, nowIso);
    if (v.status === "available" && needsPriceReview(v, nowIso) && !state.priceRequests.some((r) => r.vehicleId === v.id && (r.status === "Pending" || r.status === "Draft"))) {
      out.push({ id: `AL-price-${v.id}`, type: "Pricing", severity: "Warning", title: "Price review", recordRef: v.id, recordKind: "vehicle", trigger: `${age} days in stock with fewer enquiries than similar stock`, owner: "Manager", dueAt: null, actionLabel: "Review", branchId: v.branchId });
    } else if (v.status !== "preparation" && age > state.policy.ageingDays) {
      out.push({ id: `AL-aged-${v.id}`, type: "Pricing", severity: "Info", title: "Ageing stock", recordRef: v.id, recordKind: "vehicle", trigger: `${age} days since acquisition (policy ${state.policy.ageingDays})`, owner: "Manager", dueAt: null, actionLabel: "View", branchId: v.branchId });
    }
    if (v.status === "available" || v.status === "reserved") {
      const missing = v.documents.filter((d) => !d.provided).map((d) => d.name);
      if (missing.length) out.push({ id: `AL-docs-${v.id}`, type: "Documents", severity: "Info", title: "Document check", recordRef: v.id, recordKind: "vehicle", trigger: `${missing.join(", ")} not recorded`, owner: "Inventory", dueAt: null, actionLabel: "View", branchId: v.branchId });
    }
  }
  const slaMs = state.policy.leadResponseMinutes * 60_000;
  for (const l of state.leads) {
    if (l.stage === "Won" || l.stage === "Lost") continue;
    if (l.stage === "New" && new Date(nowIso).getTime() - new Date(l.createdAt).getTime() > slaMs) {
      out.push({ id: `AL-sla-${l.id}`, type: "Leads", severity: "Overdue", title: "Lead response overdue", recordRef: l.id, recordKind: "lead", trigger: "First response is past the response window", owner: leadOwner(l), dueAt: new Date(new Date(l.createdAt).getTime() + slaMs).toISOString(), actionLabel: "Open", branchId: l.branchId });
    }
    const overdueTask = l.tasks.find((t) => !t.done && new Date(t.dueAt).getTime() < new Date(nowIso).getTime());
    if (overdueTask && l.stage !== "New") out.push({ id: `AL-task-${l.id}`, type: "Leads", severity: "Overdue", title: "Follow-up overdue", recordRef: l.id, recordKind: "lead", trigger: overdueTask.title, owner: leadOwner(l), dueAt: overdueTask.dueAt, actionLabel: "Open", branchId: l.branchId });
  }
  for (const r of state.priceRequests) {
    if (r.status !== "Pending") continue;
    const v = state.vehicles.find((x) => x.id === r.vehicleId);
    if (v) out.push({ id: `AL-approval-${r.id}`, type: "Approvals", severity: "Info", title: "Price request awaiting approval", recordRef: r.id, recordKind: "price-request", trigger: `Submitted by ${r.requestedByName}`, owner: "Approver", dueAt: null, actionLabel: "Review", waiting: true, branchId: v.branchId });
  }
  for (const c of state.campaigns) {
    if (c.status !== "Pending") continue;
    const v = state.vehicles.find((x) => x.id === c.vehicleId);
    if (v) out.push({ id: `AL-campaign-${c.id}`, type: "Approvals", severity: "Info", title: "Campaign budget awaiting approval", recordRef: c.id, recordKind: "campaign", trigger: "Submitted for approval", owner: "Approver", dueAt: null, actionLabel: "Review", waiting: true, branchId: v.branchId });
  }

  const persisted = new Map(state.alerts.map((a) => [a.id, a]));
  const live = new Set(out.map((o) => o.id));
  const merged: Alert[] = out.map((o) => {
    const prior = persisted.get(o.id);
    const base: Alert = { ...o, assignee: prior?.assignee ?? o.owner, dueLabel: dueLabel(o.dueAt, nowIso), status: "Open", firstSeen: nowIso, lastSeen: nowIso, occurrences: 1, history: [] };
    return prior ? { ...base, ...prior, severity: o.severity, trigger: o.trigger, dueAt: o.dueAt, dueLabel: dueLabel(prior.dueAt ?? o.dueAt, nowIso), lastSeen: nowIso } : base;
  });
  // Resolved alerts stay on record; open or snoozed alerts whose condition cleared are dropped.
  for (const a of state.alerts) if (!live.has(a.id) && a.status === "Resolved") merged.push(a);
  return merged;
}
