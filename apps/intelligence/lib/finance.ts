import type { CostLedger, Sale, Vehicle } from "./domain";
import { daysBetween } from "./format";
import { SNAPSHOT_AT } from "./time";

/** Landed cost = acquisition + transport + inspection + refurbishment + purchase fees. Holding/selling costs are separate. */
export const landedCost = (c: CostLedger): number => c.acquisition + c.transport + c.inspection + c.refurbishment + c.fees;

/** Estimated gross at asking (not realized). */
export const grossAtAsking = (asking: number | null, landed: number): number | null => (asking === null ? null : asking - landed);

/** Gross = sale price - landed cost for a posted sale. Realized profit = gross - posted direct selling/holding costs. */
export const saleGross = (sale: Pick<Sale, "salePrice" | "landed">): number => sale.salePrice - sale.landed;
export const realizedProfit = (sale: Pick<Sale, "salePrice" | "landed" | "directCosts">): number => sale.salePrice - sale.landed - sale.directCosts;

export const isRealized = (sale: Sale): boolean => sale.state === "Completed";

/** Gross margin % on an explicitly named basis. */
export const marginPercent = (gross: number, basis: number): number | null => (basis === 0 ? null : (gross / basis) * 100);

export type Scenario = { offer: number; transport: number; inspection: number; refurbishment: number; fees: number; holdingSelling: number; targetResale: number };

export function scenarioTotals(s: Scenario) {
  const landed = s.offer + s.transport + s.inspection + s.refurbishment + s.fees;
  const gross = s.targetResale - landed;
  return { landed, gross, contribution: gross - s.holdingSelling };
}

export function priceImpact(input: { currentAsking: number; proposedAsking: number; landed: number; holdingSelling: number }) {
  const reduction = input.currentAsking - input.proposedAsking;
  const reductionPct = input.currentAsking === 0 ? null : (-reduction / input.currentAsking) * 100;
  const currentGross = input.currentAsking - input.landed;
  const proposedGross = input.proposedAsking - input.landed;
  return { reduction, reductionPct, currentGross, proposedGross, contribution: proposedGross - input.holdingSelling };
}

export function stockAgeDays(v: Pick<Vehicle, "acquiredAt" | "soldAt">, now: string = SNAPSHOT_AT): number {
  return daysBetween(v.acquiredAt, v.soldAt ?? now);
}

export const AGE_BUCKETS = [
  { key: "0-15", label: "0-15 days", min: 0, max: 15 },
  { key: "16-30", label: "16-30 days", min: 16, max: 30 },
  { key: "31-45", label: "31-45 days", min: 31, max: 45 },
  { key: ">45", label: ">45 days", min: 46, max: Infinity },
] as const;

export type AgeBucketKey = (typeof AGE_BUCKETS)[number]["key"];

export function ageBucket(days: number): AgeBucketKey {
  return (AGE_BUCKETS.find((bucket) => days >= bucket.min && days <= bucket.max) ?? AGE_BUCKETS[3]).key;
}

export const REVIEW_THRESHOLD_DAYS = 30;
export const AGEING_DAYS = 45;

/** Price review is a flag, never a lifecycle state: ageing beyond the threshold with fewer enquiries than the cohort median. */
export function needsPriceReview(v: Vehicle, now: string = SNAPSHOT_AT): boolean {
  if (v.status !== "available" || v.asking === null) return false;
  return stockAgeDays(v, now) > REVIEW_THRESHOLD_DAYS && v.enquiries14d < v.cohortMedianEnquiries;
}

export type StockMetrics = {
  unsold: number;
  available: number;
  reserved: number;
  preparation: number;
  landedCapital: number;
  ageing: number;
  estimatedGross: number;
  grossExcluded: number;
  availableByAge: Record<AgeBucketKey, number>;
  capitalByAge: Record<AgeBucketKey, number>;
};

/** Shared by Command Centre, Capital and the read-model APIs so every surface reconciles. */
export function stockMetrics(stock: readonly Vehicle[], now: string = SNAPSHOT_AT): StockMetrics {
  const empty = (): Record<AgeBucketKey, number> => ({ "0-15": 0, "16-30": 0, "31-45": 0, ">45": 0 });
  const metrics: StockMetrics = {
    unsold: 0, available: 0, reserved: 0, preparation: 0, landedCapital: 0, ageing: 0, estimatedGross: 0, grossExcluded: 0,
    availableByAge: empty(), capitalByAge: empty(),
  };
  for (const v of stock) {
    if (v.status === "sold" || v.status === "archived") continue;
    const landed = landedCost(v.costs);
    const bucket = ageBucket(stockAgeDays(v, now));
    metrics.unsold += 1;
    metrics.landedCapital += landed;
    metrics.capitalByAge[bucket] += landed;
    if (v.status === "reserved") metrics.reserved += 1;
    if (v.status === "preparation") metrics.preparation += 1;
    if (v.status === "available") {
      metrics.available += 1;
      metrics.availableByAge[bucket] += 1;
      if (bucket === ">45") metrics.ageing += 1;
      if (v.costComplete && v.asking !== null) metrics.estimatedGross += v.asking - landed;
      else metrics.grossExcluded += 1;
    }
  }
  return metrics;
}

export type RealizedMetrics = { count: number; profit: number; medianDaysToSale: number | null; excluded: number };

export function medianOf(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Realized figures count only completed, non-void, reconciled sales. Estimates never enter this metric. */
export function realizedMetrics(sales: readonly Sale[], daysToSale: (sale: Sale) => number | null): RealizedMetrics {
  const counted = sales.filter(isRealized);
  const days = counted.map(daysToSale).filter((d): d is number => d !== null);
  return { count: counted.length, profit: counted.reduce((a, s) => a + realizedProfit(s), 0), medianDaysToSale: medianOf(days), excluded: sales.length - counted.length };
}
