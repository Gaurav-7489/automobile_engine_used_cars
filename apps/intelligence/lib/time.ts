import { isLive } from "./mode";

/**
 * "As of" instant for every age, due-date and freshness calculation. Sample fixtures are anchored to
 * 19 Oct 2026, 10:00 IST; live workspaces call setAsOf with the request time (rounded to the minute so
 * server rendering and hydration agree).
 */
export let SNAPSHOT_AT = "2026-10-19T04:30:00.000Z";
export let SNAPSHOT_ID = "S-20261019-1000";
export const FORMULA_VERSION = "v1.0";
export let REPORT_SNAPSHOT_ID = "R-6001";

export function setAsOf(iso: string): void {
  const minute = new Date(Math.floor(new Date(iso).getTime() / 60_000) * 60_000);
  SNAPSHOT_AT = minute.toISOString();
  const compact = SNAPSHOT_AT.replace(/[-:T]/g, "").slice(0, 12);
  SNAPSHOT_ID = `S-${compact}`;
  REPORT_SNAPSHOT_ID = `R-${compact}`;
}

/** Build an ISO instant from an IST wall-clock date/time. */
export function ist(year: number, month: number, day: number, hour = 10, minute = 0): string {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - (5 * 60 + 30) * 60_000).toISOString();
}

/** An instant `days` before the snapshot, at 10:00 IST. */
export function daysBeforeSnapshot(days: number, hour = 10, minute = 0): string {
  const snapshot = new Date(SNAPSHOT_AT);
  const y = snapshot.getUTCFullYear();
  const m = snapshot.getUTCMonth();
  const d = snapshot.getUTCDate();
  return new Date(Date.UTC(y, m, d - days, hour, minute) - (5 * 60 + 30) * 60_000).toISOString();
}

const SAMPLE_MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"] as const;

/** Reporting window: the six calendar months (Asia/Kolkata) ending with the month of the "as of" instant. Sample fixtures use their fixed window. */
export function getMonths(): readonly string[] {
  if (!isLive()) return SAMPLE_MONTHS;
  const ist = new Date(new Date(SNAPSHOT_AT).getTime() + 330 * 60_000);
  const out: string[] = [];
  for (let back = 5; back >= 0; back -= 1) {
    const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - back, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
