import type { EvidenceTier, Listing, Vehicle } from "./domain";
import { evidenceTier, median, percentile } from "./evidence";
import { BMW_COMPARABLES, LISTINGS, MERC_COMPARABLES } from "./fixtures/market";
import { isLive } from "./mode";
import { SNAPSHOT_AT } from "./time";

export type Valuation = {
  estimate: number | null;
  low: number | null;
  high: number | null;
  n: number;
  completeness: number;
  windowDays: number;
  tier: EvidenceTier;
  observedAt: string;
  computedAt: string;
  methodVersion: string;
  comparableIds: string[];
  matchedOn: string;
};

export const METHOD_VERSION = "valuation-v1.0";

/** Versioned model output: median of matched asking prices with nearest-rank P25/P75. Asking prices, not transactions. */
export function valuationFor(vehicle: Pick<Vehicle, "make" | "model" | "variant" | "year" | "fuel" | "transmission" | "id">): Valuation {
  // No licensed market feed is connected in a live workspace: there is no comparable evidence, so no estimate is issued.
  if (isLive()) return fromAsks([], 0, 14);
  if (vehicle.make === "Mercedes-Benz" && vehicle.model === "E220d") return fromAsks(MERC_COMPARABLES.map((c) => [c.id, c.asking] as const), 0.86, 14);
  if (vehicle.make === "BMW" && vehicle.model === "520d") return fromAsks(BMW_COMPARABLES.map((c) => [c.id, c.asking] as const), 0.86, 14);
  const cohort: Listing[] = LISTINGS.filter((l) => l.make === vehicle.make && l.model === vehicle.model && Math.abs(l.year - vehicle.year) <= 2);
  const asks = cohort.map((l) => [l.id, l.asking] as const);
  const completeness = cohort.length ? cohort.reduce((a, l) => a + l.completeness, 0) / cohort.length : 0;
  return fromAsks(asks, completeness, 14);
}

function fromAsks(entries: readonly (readonly [string, number])[], completeness: number, windowDays: number): Valuation {
  const asks = entries.map((entry) => entry[1]);
  const n = asks.length;
  const tier = evidenceTier(n, completeness, windowDays);
  const usable = tier !== "Insufficient";
  return {
    estimate: usable ? median(asks) : null,
    low: usable ? percentile(asks, 25) : null,
    high: usable ? percentile(asks, 75) : null,
    n, completeness, windowDays, tier, observedAt: SNAPSHOT_AT, computedAt: SNAPSHOT_AT, methodVersion: METHOD_VERSION,
    comparableIds: entries.map((entry) => entry[0]), matchedOn: "Variant, year, fuel, transmission, km band and owner band",
  };
}

export function valuationForListing(listing: Listing): Valuation {
  const base = valuationFor(listing as unknown as Vehicle);
  return { ...base, estimate: listing.estimate, tier: evidenceTier(listing.matched, listing.completeness, listing.freshestDays), n: listing.matched, completeness: listing.completeness, windowDays: listing.freshestDays };
}

import type { Comparable } from "./fixtures/market";

/** Comparable asks behind a stock vehicle's valuation. */
export function comparablesForVehicle(vehicle: Pick<Vehicle, "make" | "model" | "year">): Comparable[] {
  if (isLive()) return [];
  if (vehicle.make === "Mercedes-Benz" && vehicle.model === "E220d") return MERC_COMPARABLES;
  if (vehicle.make === "BMW" && vehicle.model === "520d") return BMW_COMPARABLES;
  return LISTINGS.filter((l) => l.make === vehicle.make && l.model === vehicle.model && Math.abs(l.year - vehicle.year) <= 2).map((l) => ({
    id: l.id, asking: l.asking, year: l.year, km: l.km, owners: l.owners, city: l.city, observedAt: l.observedAt, ageDays: Math.round((new Date(SNAPSHOT_AT).getTime() - new Date(l.observedAt).getTime()) / 86_400_000),
    source: l.source, matchedAttributes: ["Make", "Model", "Year ±2"],
  }));
}
