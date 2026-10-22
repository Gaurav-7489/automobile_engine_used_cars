import type { EvidenceTier } from "./domain";

export const EVIDENCE_RULE_VERSION = "evidence-v1.0";
export const STALE_LISTING_DAYS = 14;
export const SOURCE_SILENCE_HOURS = 24;
export const EVIDENCE_EXPIRY_DAYS = 7;

/**
 * Proposed deterministic rule (specification page 4). This is evidence coverage, not a probability of accuracy.
 *   High:     n >= 30, >= 90% match completeness, freshest cohort <= 7 days
 *   Moderate: n >= 10, >= 80% completeness, <= 14 days
 *   Insufficient otherwise
 */
export function evidenceTier(n: number, completeness: number, windowDays: number): EvidenceTier {
  if (n >= 30 && completeness >= 0.9 && windowDays <= 7) return "High";
  if (n >= 10 && completeness >= 0.8 && windowDays <= 14) return "Moderate";
  return "Insufficient";
}

export const tierExplanation: Record<EvidenceTier, string> = {
  High: "n ≥ 30, ≥ 90% match completeness and freshest cohort ≤ 7 days",
  Moderate: "n ≥ 10, ≥ 80% match completeness and cohort ≤ 14 days",
  Insufficient: "Too few, too incomplete or too old for a recommendation. Descriptive evidence only.",
};

/** Nearest-rank percentile (method v1.0). Values must be numeric; input is not mutated. */
export function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(sorted.length, rank) - 1];
}

export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(mid)] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Difference = (asking - estimate) / estimate. Unknown when no estimate exists; never zero. */
export function difference(asking: number, estimate: number | null): number | null {
  if (estimate === null || estimate === 0) return null;
  return ((asking - estimate) / estimate) * 100;
}

export function differenceLabel(value: number | null): string {
  if (value === null) return "Unknown";
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "At estimate";
  return rounded < 0 ? "Below estimate" : "Above estimate";
}

export const canRecommend = (tier: EvidenceTier): boolean => tier !== "Insufficient";
