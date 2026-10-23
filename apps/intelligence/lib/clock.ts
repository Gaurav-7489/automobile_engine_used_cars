import { isLive } from "./mode";
import { SNAPSHOT_AT } from "./time";

/**
 * Demo clock: starts at the illustrative snapshot (19 Oct 2026, 10:00 IST) and advances in real time,
 * so evidence ages, due dates and approvals behave consistently with the sample dataset.
 */
const startedAt = Date.now();
let override: string | null = null;

export function now(): string {
  if (override) return override;
  if (isLive()) return new Date().toISOString();
  return new Date(new Date(SNAPSHOT_AT).getTime() + (Date.now() - startedAt)).toISOString();
}

/** Tests may pin the clock. */
export function setNow(iso: string | null): void {
  override = iso;
}
