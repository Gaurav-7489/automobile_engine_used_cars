/** All illustrative data is anchored to this snapshot instant: 19 Oct 2026, 10:00 IST. */
export const SNAPSHOT_AT = "2026-10-19T04:30:00.000Z";
export const SNAPSHOT_ID = "S-20261019-1000";
export const FORMULA_VERSION = "v1.0";
export const REPORT_SNAPSHOT_ID = "R-6001";

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
