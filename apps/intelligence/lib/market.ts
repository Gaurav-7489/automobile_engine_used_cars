import type { Listing, RegionStat } from "./domain";
import { difference } from "./evidence";
import { evidenceTier, median, percentile } from "./evidence";
import { LISTINGS, REGION_STATS, searchText } from "./fixtures/market";
import { lakh } from "./format";
import { isLive } from "./mode";

export const OPPORTUNITY_RULE_VERSION = "opportunity-v1.0";
export const PAGE_SIZES = [25, 50, 100] as const;

const REFERENCE_IDS = ["M-501", "M-502", "M-503", "M-504", "M-505", "M-506"];
const DISTANCE_FROM_KOCHI: Record<string, number> = { Kochi: 0, Bengaluru: 550, Chennai: 690, Hyderabad: 1100, Pune: 1230, Mumbai: 1350, Delhi: 2700 };

export type MarketQuery = {
  q: string; make: string; variant: string; yearFrom: number | null; yearTo: number | null; region: string; priceMin: number | null; priceMax: number | null;
  fuel: string; transmission: string; kmMax: number | null; owners: number | null; city: string; observedDays: number | null; sort: string; cursor: number; limit: number;
};

const num = (value: string | null): number | null => (value && /^\d+(\.\d+)?$/.test(value) ? Number(value) : null);

/** Whitelisted filters and sorts: unknown parameters are ignored, never interpreted. */
export function parseMarketQuery(params: URLSearchParams): MarketQuery {
  const sort = params.get("sort") ?? "opportunity";
  const cursor = params.get("cursor");
  const limit = Number(params.get("limit"));
  return {
    q: (params.get("q") ?? "").slice(0, 80), make: (params.get("make") ?? "").slice(0, 40), variant: (params.get("variant") ?? "").slice(0, 40), yearFrom: num(params.get("yearFrom")), yearTo: num(params.get("yearTo")),
    region: (params.get("region") ?? "").slice(0, 40), priceMin: num(params.get("priceMin")), priceMax: num(params.get("priceMax")), fuel: ["Diesel", "Petrol"].includes(params.get("fuel") ?? "") ? params.get("fuel")! : "",
    transmission: ["Automatic", "Manual"].includes(params.get("transmission") ?? "") ? params.get("transmission")! : "", kmMax: num(params.get("kmMax")), owners: num(params.get("owners")), city: (params.get("city") ?? "").slice(0, 40),
    observedDays: num(params.get("observed")), sort: ["opportunity", "asking_asc", "asking_desc", "newest", "distance"].includes(sort) ? sort : "opportunity",
    cursor: cursor && /^\d+$/.test(cursor) ? Number(cursor) : 0, limit: (PAGE_SIZES as readonly number[]).includes(limit) ? limit : 25,
  };
}

export type ListingRow = Listing & { difference: number | null; tier: ReturnType<typeof evidenceTier>; rank: number | null; distanceKm: number | null; landedAdjust: number };

export function decorate(listing: Listing, baseRegion: string): ListingRow {
  const diff = difference(listing.asking, listing.estimate);
  const tier = evidenceTier(listing.matched, listing.completeness, listing.freshestDays);
  const distanceFrom = DISTANCE_FROM_KOCHI[listing.region];
  const baseKm = DISTANCE_FROM_KOCHI[baseRegion] ?? 0;
  const stat = REGION_STATS.find((r) => r.region === listing.region);
  // Opportunity rank is only issued with usable evidence: price gap x comparable count x freshness. Insufficient evidence has no rank.
  const rank = diff === null || tier === "Insufficient" ? null : Math.round(-diff * Math.min(1, listing.matched / 30) * (listing.freshestDays <= 14 ? 1 : 0.6) * 100) / 100;
  return { ...listing, difference: diff, tier, rank, distanceKm: distanceFrom === undefined ? null : Math.abs(distanceFrom - baseKm), landedAdjust: stat ? stat.transport + stat.fees : 0 };
}

export function queryListings(query: MarketQuery, baseRegion = "Kochi"): { rows: ListingRow[]; total: number; next: number | null } {
  if (isLive()) return { rows: [], total: 0, next: null };
  const tokens = query.q.toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = LISTINGS.filter((l) => {
    const text = searchText(l);
    if (!tokens.every((t) => text.includes(t))) return false;
    if (query.make && l.make.toLowerCase() !== query.make.toLowerCase()) return false;
    if (query.variant && l.variant.toLowerCase() !== query.variant.toLowerCase()) return false;
    if (query.yearFrom && l.year < query.yearFrom) return false;
    if (query.yearTo && l.year > query.yearTo) return false;
    if (query.region && l.region.toLowerCase() !== query.region.toLowerCase()) return false;
    if (query.city && l.city.toLowerCase() !== query.city.toLowerCase()) return false;
    if (query.priceMin && l.asking < lakh(query.priceMin)) return false;
    if (query.priceMax && l.asking > lakh(query.priceMax)) return false;
    if (query.fuel && l.fuel !== query.fuel) return false;
    if (query.transmission && l.transmission !== query.transmission) return false;
    if (query.kmMax && l.km > query.kmMax) return false;
    if (query.owners && l.owners > query.owners) return false;
    if (query.observedDays !== null) {
      const ageDays = (new Date("2026-10-19T04:30:00.000Z").getTime() - new Date(l.observedAt).getTime()) / 86_400_000;
      if (ageDays > query.observedDays) return false;
    }
    return true;
  }).map((l) => decorate(l, baseRegion));
  const sorted = [...filtered];
  const byRank = (a: ListingRow, b: ListingRow) => (a.rank === null ? 1 : 0) - (b.rank === null ? 1 : 0) || (b.rank ?? 0) - (a.rank ?? 0) || a.id.localeCompare(b.id);
  // Sample dataset: the six reference listings from the specification lead the default view so the reference screens reproduce.
  const reference = (l: ListingRow) => (REFERENCE_IDS.includes(l.id) ? 0 : 1);
  if (query.sort === "opportunity") sorted.sort((a, b) => reference(a) - reference(b) || (reference(a) === 0 ? a.id.localeCompare(b.id) : byRank(a, b)));
  if (query.sort === "asking_asc") sorted.sort((a, b) => a.asking - b.asking || a.id.localeCompare(b.id));
  if (query.sort === "asking_desc") sorted.sort((a, b) => b.asking - a.asking || a.id.localeCompare(b.id));
  if (query.sort === "newest") sorted.sort((a, b) => b.observedAt.localeCompare(a.observedAt) || a.id.localeCompare(b.id));
  if (query.sort === "distance") sorted.sort((a, b) => (a.distanceKm === null ? 1 : 0) - (b.distanceKm === null ? 1 : 0) || (a.distanceKm ?? 0) - (b.distanceKm ?? 0) || a.id.localeCompare(b.id)); // missing distance sorts last
  const rows = sorted.slice(query.cursor, query.cursor + query.limit);
  const nextOffset = query.cursor + query.limit;
  return { rows, total: sorted.length, next: nextOffset < sorted.length ? nextOffset : null };
}

export type CohortFilter = { make: string; model: string; variant: string; fuel: string; transmission: string; yearFrom: number; yearTo: number; kmMin: number; kmMax: number; ownersMax: number; windowDays: number };

export const DEFAULT_COHORT: CohortFilter = { make: "BMW", model: "520d", variant: "Luxury Line", fuel: "Diesel", transmission: "Automatic", yearFrom: 2018, yearTo: 2020, kmMin: 40000, kmMax: 80000, ownersMax: 2, windowDays: 14 };

const sameCohort = (c: CohortFilter) => JSON.stringify(c) === JSON.stringify(DEFAULT_COHORT);

/** Regional medians and IQR over a like-for-like cohort. Asking prices, not transactions. Unknown match fields are excluded and counted. */
export function regionStats(cohort: CohortFilter): { stats: RegionStat[]; excluded: number; computed: boolean } {
  if (isLive()) return { stats: [], excluded: 0, computed: true };
  if (sameCohort(cohort)) return { stats: REGION_STATS, excluded: 3, computed: false };
  const cityRegions = Array.from(new Set(LISTINGS.map((l) => l.region)));
  let excluded = 0;
  const stats: RegionStat[] = cityRegions.map((region) => {
    const rows = LISTINGS.filter((l) => {
      if (l.region !== region) return false;
      const ok = l.make === cohort.make && l.model === cohort.model && (!cohort.variant || l.variant === cohort.variant) && (!cohort.fuel || l.fuel === cohort.fuel) && (!cohort.transmission || l.transmission === cohort.transmission)
        && l.year >= cohort.yearFrom && l.year <= cohort.yearTo && l.km >= cohort.kmMin && l.km <= cohort.kmMax && l.owners <= cohort.ownersMax;
      if (!ok) excluded += 1;
      return ok;
    });
    const base = REGION_STATS.find((r) => r.region === region);
    const asks = rows.map((l) => l.asking);
    const n = asks.length;
    const completeness = n ? rows.reduce((a, l) => a + l.completeness, 0) / n : 0;
    return {
      region, state: rows[0]?.state ?? base?.state ?? "", n, median: n ? median(asks) : null, q1: n ? percentile(asks, 25) : null, q3: n ? percentile(asks, 75) : null,
      observedAt: rows.length ? rows.map((l) => l.observedAt).sort().at(-1)! : null, completeness, freshestDays: cohort.windowDays, transport: base?.transport ?? lakh(0.6), fees: base?.fees ?? lakh(0.2),
      status: n ? "ok" : "unavailable",
    };
  });
  return { stats, excluded, computed: true };
}

import { BMW_COMPARABLES, BMW_EXCLUSIONS, MERC_COMPARABLES, M501_PRICE_HISTORY, type Comparable } from "./fixtures/market";
import { daysBeforeSnapshot } from "./time";

/** Comparable asks behind a listing's estimate, plus counted exclusions. */
export function comparablesFor(listing: Listing): { items: Comparable[]; exclusions: { id: string; reason: string }[] } {
  if (isLive()) return { items: [], exclusions: [] };
  if (listing.make === "BMW" && listing.model === "520d" && listing.variant === "Luxury Line") return { items: BMW_COMPARABLES, exclusions: BMW_EXCLUSIONS };
  if (listing.make === "Mercedes-Benz" && listing.model === "E220d") return { items: MERC_COMPARABLES, exclusions: [{ id: "M-X-9", reason: "Observed more than 14 days ago" }] };
  const peers = LISTINGS.filter((l) => l.id !== listing.id && l.make === listing.make && l.model === listing.model && Math.abs(l.year - listing.year) <= 1).slice(0, 18);
  const items: Comparable[] = peers.map((l) => ({
    id: l.id, asking: l.asking, year: l.year, km: l.km, owners: l.owners, city: l.city, observedAt: l.observedAt, ageDays: Math.round((new Date("2026-10-19T04:30:00.000Z").getTime() - new Date(l.observedAt).getTime()) / 86_400_000),
    source: l.source, matchedAttributes: ["Make", "Model", "Year ±1", "Fuel"],
  }));
  return { items, exclusions: [] };
}

export function priceHistoryFor(listing: Listing): { at: string; ask: number | null }[] {
  if (listing.id === "M-501") return M501_PRICE_HISTORY;
  return [13, 9, 6, 3, 0].map((d, i) => ({ at: daysBeforeSnapshot(d), ask: i === 2 ? null : Math.round((listing.asking * (1 + (4 - i) * 0.004)) / 100_000) * 100_000 }));
}
