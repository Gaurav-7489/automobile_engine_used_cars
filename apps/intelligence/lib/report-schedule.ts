import type { Role } from "./domain";
import { can } from "./permissions";

/**
 * Scheduled report emails: the rules shared by the browser, the workspace command and the delivery job.
 *
 * A schedule sends a link, never figures: the recipient signs in and the report shows only what their role and branches allow
 * at that moment. Runs are at 07:00 India time on the start date and then every 7 days (Weekly) or on the same day of each month
 * (Monthly, the last day in shorter months). The delivery job runs once a day shortly after 07:30 IST.
 */

export const REPORT_KEYS = ["overview", "inventory", "leads", "marketing", "finance"] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];
export const REPORT_LABEL: Record<ReportKey, string> = { overview: "Overview", inventory: "Inventory", leads: "Leads", marketing: "Marketing", finance: "Finance" };
export const CADENCES = ["Weekly", "Monthly"] as const;
export type Cadence = (typeof CADENCES)[number];

export type ReportSchedule = {
  id: string;
  report: ReportKey;
  cadence: Cadence;
  timezone: "Asia/Kolkata";
  /** First run date in India time, YYYY-MM-DD. */
  startDate: string;
  /** Staff user ids. Each must still have access when a run is sent. */
  recipients: string[];
  /** Branches the report covers; a recipient sees only the ones they are permitted. */
  branchIds: string[];
  createdBy: string;
  createdAt: string;
  /** The next run instant (UTC ISO). */
  nextRunAt: string;
  lastSentAt?: string;
  /** Plain-language outcome of the last run, e.g. "Sent to 2 of 2 recipients". */
  lastResult?: string;
  /** Delivery bookkeeping (server only). */
  attempts?: number;
  claimedUntil?: string;
};

export const MAX_SCHEDULES = 25;
export const MAX_RECIPIENTS = 10;
export const RUN_HOUR_IST = 7;
const IST_MS = 330 * 60_000;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Calendar date in India time for an instant. */
export function istDay(instant: string | number | Date): string {
  return new Date(new Date(instant).getTime() + IST_MS).toISOString().slice(0, 10);
}

export function validDate(value: string): boolean {
  const m = DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

const runInstant = (y: number, monthIndex: number, day: number): string => new Date(Date.UTC(y, monthIndex, day, RUN_HOUR_IST, 0) - IST_MS).toISOString();

/** The k-th run (k = 0 is the start date). */
export function runAt(schedule: Pick<ReportSchedule, "cadence" | "startDate">, k: number): string {
  const [y, m, d] = schedule.startDate.split("-").map(Number);
  if (schedule.cadence === "Weekly") return runInstant(y, m - 1, d + 7 * k);
  const last = new Date(Date.UTC(y, m - 1 + k + 1, 0)).getUTCDate();
  return runInstant(y, m - 1 + k, Math.min(d, last));
}

/** The first run strictly after `instant`. Missed runs are skipped, never sent in a burst. */
export function nextRunAfter(schedule: Pick<ReportSchedule, "cadence" | "startDate">, instant: string): string {
  const t = new Date(instant).getTime();
  // Jump close to the answer, then step: weekly runs are exact multiples of 7 days; monthly runs are about 30.4 days apart.
  const first = new Date(runAt(schedule, 0)).getTime();
  let k = t <= first ? 0 : Math.max(0, Math.floor((t - first) / ((schedule.cadence === "Weekly" ? 7 : 31) * 86_400_000)) - 1);
  for (let guard = 0; guard < 1000; guard += 1, k += 1) {
    const at = runAt(schedule, k);
    if (new Date(at).getTime() > t) return at;
  }
  throw new Error("no next run");
}

/** Who may receive a report: active, allowed to view it, and sharing at least one of its branches. */
export function mayReceive(member: { role: Role; branchIds: string[]; status?: string }, report: ReportKey, branchIds: string[]): boolean {
  if (member.status && member.status !== "Active") return false;
  if (!can(member.role, "reports.view")) return false;
  if (report === "finance" && !can(member.role, "reports.finance")) return false;
  return member.branchIds.some((b) => branchIds.includes(b));
}

/** The month a run covers: Weekly shows the current month to date, Monthly the month that just finished. YYYY-MM. */
export function periodFor(cadence: Cadence, runFor: string): string {
  const [y, m] = istDay(runFor).split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - (cadence === "Monthly" ? 1 : 0), 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function reportLink(origin: string, report: ReportKey, month: string): string {
  const q = new URLSearchParams();
  if (report !== "overview") q.set("tab", report);
  q.set("from", month);
  q.set("to", month);
  return `${origin.replace(/\/$/, "")}/app/reports?${q.toString()}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthWords = (month: string): string => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

/** The email: a link and the branch names, never figures or customer details. */
export function reportEmail(input: { origin: string; dealer: string; schedule: Pick<ReportSchedule, "report" | "cadence" | "createdBy">; runFor: string; branchNames: string[] }): { subject: string; text: string } {
  const label = REPORT_LABEL[input.schedule.report];
  const month = periodFor(input.schedule.cadence, input.runFor);
  const cadence = input.schedule.cadence.toLowerCase();
  const period = input.schedule.cadence === "Weekly" ? `${monthWords(month)} to date` : monthWords(month);
  return {
    subject: `${input.dealer ? `${input.dealer}: ` : ""}your ${cadence} ${label} report is ready`,
    text: [
      `Your ${cadence} ${label} report for ${period} is ready.`,
      "",
      "Open it in your workspace (sign-in required):",
      reportLink(input.origin, input.schedule.report, month),
      "",
      `Branches: ${input.branchNames.join(", ")}.`,
      "The report shows only what your role and branches allow. This email contains no figures or customer details.",
      "",
      `${input.schedule.createdBy || "Your team"} set up this schedule in Reports. To stop it, open Reports, choose Schedule and delete it.`,
      "",
      `${input.dealer ? `${input.dealer} · ` : ""}VandLabs`,
    ].join("\n"),
  };
}
