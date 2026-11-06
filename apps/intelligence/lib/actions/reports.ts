import { now } from "../clock";
import { can } from "../permissions";
import { CADENCES, istDay, MAX_RECIPIENTS, MAX_SCHEDULES, mayReceive, REPORT_KEYS, REPORT_LABEL, runAt, validDate, type Cadence, type ReportKey, type ReportSchedule } from "../report-schedule";
import type { WorkspaceState } from "../state";
import { type Actor, type Result, fail, guard, nextId, ok, withAudit } from "./common";

export type ScheduleInput = { report: string; cadence: string; startDate: string; recipients: string[]; branchIds: string[] };

/**
 * Saves a scheduled report email. Only people who may schedule (Owner, Manager, Finance) can, only for branches they can access,
 * and only to colleagues who may view that report for at least one of those branches. Access is checked again at every send.
 */
export function saveReportSchedule(state: WorkspaceState, actor: Actor, input: ScheduleInput): Result<{ schedule: ReportSchedule }> {
  const denied = guard(actor, "reports.schedule");
  if (denied) return denied;
  const fields: Record<string, string> = {};
  const report = String(input?.report ?? "") as ReportKey;
  const cadence = String(input?.cadence ?? "") as Cadence;
  const startDate = String(input?.startDate ?? "");
  const recipients = [...new Set(Array.isArray(input?.recipients) ? input.recipients.map(String) : [])];
  const branchIds = [...new Set(Array.isArray(input?.branchIds) ? input.branchIds.map(String) : [])];
  if (!REPORT_KEYS.includes(report)) fields.report = "Choose a report.";
  else if (report === "finance" && !can(actor.role, "reports.finance")) fields.report = "Finance reports need Owner or Finance access.";
  if (!CADENCES.includes(cadence)) fields.cadence = "Choose weekly or monthly.";
  const today = istDay(now());
  if (!validDate(startDate)) fields.start = "Choose a start date.";
  else if (startDate < today) fields.start = "The start date cannot be in the past.";
  else if (startDate > istDay(new Date(now()).getTime() + 366 * 86_400_000)) fields.start = "Choose a start date within the next year.";
  if (!branchIds.length) fields.branches = "Choose at least one branch.";
  else if (branchIds.some((b) => !actor.branchIds.includes(b) || !state.branches.some((x) => x.id === b))) fields.branches = "You can only schedule reports for branches you can access.";
  if (!recipients.length) fields.recipients = "Choose at least one permitted recipient.";
  else if (recipients.length > MAX_RECIPIENTS) fields.recipients = `Choose at most ${MAX_RECIPIENTS} recipients.`;
  else if (!fields.report && !fields.branches) {
    const blocked = recipients.filter((id) => { const m = state.team.find((t) => t.id === id); return !m || !mayReceive(m, report, branchIds); });
    if (blocked.length) fields.recipients = "Every recipient must be an active colleague who can view this report for at least one chosen branch.";
  }
  if (state.reportSchedules.length >= MAX_SCHEDULES) fields.form = `This workspace already has ${MAX_SCHEDULES} schedules. Delete one first.`;
  if (Object.keys(fields).length) return fail(422, "invalid", fields.form ?? "Fix the highlighted fields to save the schedule.", { fields });

  const id = nextId("RS", state.reportSchedules.map((s) => s.id), 1);
  const schedule: ReportSchedule = { id, report, cadence, timezone: "Asia/Kolkata", startDate, recipients, branchIds, createdBy: actor.name, createdAt: now(), nextRunAt: runAt({ cadence, startDate }, 0) };
  // Saving a schedule is the dealership asking for report emails, so the Settings switch for them is turned on (and audited).
  const notifications = state.notifications["reports.ready"] ? state.notifications : { ...state.notifications, "reports.ready": true };
  const next = withAudit({ ...state, notifications, reportSchedules: [...state.reportSchedules, schedule] }, actor, "report.scheduled", id, `${cadence} ${REPORT_LABEL[report]} from ${startDate} to ${recipients.length} recipient(s)`);
  return ok(next, { schedule });
}

/** Deletes a schedule. Someone who cannot access every branch it covers is told it does not exist. */
export function deleteReportSchedule(state: WorkspaceState, actor: Actor, id: string): Result {
  const denied = guard(actor, "reports.schedule");
  if (denied) return denied;
  const schedule = state.reportSchedules.find((s) => s.id === id);
  if (!schedule || (schedule.branchIds ?? []).some((b) => !actor.branchIds.includes(b))) return fail(404, "not_found", "Record not found.");
  return ok(withAudit({ ...state, reportSchedules: state.reportSchedules.filter((s) => s.id !== id) }, actor, "report.schedule_deleted", id, `${schedule.cadence} ${REPORT_LABEL[schedule.report] ?? schedule.report}`));
}
