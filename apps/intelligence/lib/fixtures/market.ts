import type { Listing, RegionStat } from "../domain";
import { lakh } from "../format";
import { mulberry32, pick } from "../rng";
import { daysBeforeSnapshot, ist } from "../time";

type CityRow = { city: string; state: string; region: string };

export const CITIES: CityRow[] = [
  { city: "Kochi", state: "Kerala", region: "Kochi" },
  { city: "Bengaluru", state: "Karnataka", region: "Bengaluru" },
  { city: "Chennai", state: "Tamil Nadu", region: "Chennai" },
  { city: "Mumbai", state: "Maharashtra", region: "Mumbai" },
  { city: "Delhi", state: "Delhi", region: "Delhi" },
  { city: "Pune", state: "Maharashtra", region: "Pune" },
  { city: "Hyderabad", state: "Telangana", region: "Hyderabad" },
];

const cityBy = (name: string): CityRow => CITIES.find((c) => c.city === name)!;

type Fixed = { id: string; city: string; year: number; km: number; owners: number; ask: number; est: number | null; source: Listing["source"]; matched: number; completeness: number; window: number; observed: string };

// Rows shown on specification page 14 / 17 (illustrative). M-501 is the listing detail sample.
const FIXED_BMW: Fixed[] = [
  { id: "M-501", city: "Kochi", year: 2019, km: 58000, owners: 1, ask: 28.5, est: 29.2, source: "Authorised feed A", matched: 18, completeness: 0.86, window: 14, observed: ist(2026, 10, 19, 9, 10) },
  { id: "M-502", city: "Bengaluru", year: 2020, km: 64000, owners: 2, ask: 28.1, est: 29.2, source: "Authorised feed A", matched: 24, completeness: 0.88, window: 14, observed: ist(2026, 10, 19, 8, 40) },
  { id: "M-503", city: "Chennai", year: 2018, km: 71000, owners: 2, ask: 26.8, est: 28.0, source: "Authorised feed B", matched: 16, completeness: 0.84, window: 14, observed: ist(2026, 10, 18, 17, 5) },
  { id: "M-504", city: "Mumbai", year: 2019, km: 52000, owners: 1, ask: 30.0, est: 29.2, source: "Authorised feed B", matched: 21, completeness: 0.87, window: 14, observed: ist(2026, 10, 18, 12, 30) },
  { id: "M-505", city: "Delhi", year: 2020, km: 61000, owners: 2, ask: 29.8, est: null, source: "Authorised feed A", matched: 6, completeness: 0.7, window: 14, observed: ist(2026, 10, 17, 15, 0) },
  { id: "M-506", city: "Pune", year: 2019, km: 67000, owners: 2, ask: 27.8, est: 29.0, source: "Authorised feed B", matched: 7, completeness: 0.82, window: 14, observed: ist(2026, 10, 17, 10, 20) },
];

const REGION_ADJUST: Record<string, number> = { Kochi: 0, Bengaluru: -1.1, Chennai: -0.6, Mumbai: 0.8, Delhi: 0.2, Pune: -0.4, Hyderabad: -0.7 };

function bmwCohort(): Listing[] {
  const rng = mulberry32(520019);
  const listings: Listing[] = FIXED_BMW.map((f) => {
    const c = cityBy(f.city);
    return { id: f.id, make: "BMW", model: "520d", variant: "Luxury Line", year: f.year, fuel: "Diesel", transmission: "Automatic", km: f.km, owners: f.owners, city: c.city, state: c.state, region: c.region,
      source: f.source, observedAt: f.observed, asking: lakh(f.ask), estimate: f.est === null ? null : lakh(f.est), matched: f.matched, completeness: f.completeness, freshestDays: f.window, version: "valuation-v1.0" };
  });
  for (let i = 0; i < 118; i += 1) {
    const c = pick(rng, CITIES);
    const year = pick(rng, [2018, 2019, 2019, 2020, 2020]);
    const km = 40000 + Math.floor(rng() * 40) * 1000;
    const owners = rng() > 0.55 ? 2 : 1;
    const base = 29.2 + (year - 2019) * 1.1 - (km - 58000) / 58000 * 1.5 + REGION_ADJUST[c.region] * 0.6;
    const ask = Math.round((base + (rng() - 0.5) * 3.2) * 10) / 10;
    const matched = c.region === "Delhi" ? 6 : 12 + Math.floor(rng() * 14);
    listings.push({
      id: `M-${507 + i}`, make: "BMW", model: "520d", variant: "Luxury Line", year, fuel: "Diesel", transmission: "Automatic", km, owners,
      city: c.city, state: c.state, region: c.region, source: rng() > 0.5 ? "Authorised feed A" : "Authorised feed B",
      observedAt: daysBeforeSnapshot(Math.floor(rng() * 14), 9 + Math.floor(rng() * 8), Math.floor(rng() * 60)),
      asking: lakh(Math.min(34.5, Math.max(20.5, ask))), estimate: matched < 10 ? null : lakh(Math.round((base + REGION_ADJUST[c.region] * 0.3) * 10) / 10),
      matched, completeness: matched < 10 ? 0.7 : 0.8 + Math.floor(rng() * 10) / 100, freshestDays: 14, version: "valuation-v1.0",
    });
  }
  return listings;
}

type Spec = { make: string; model: string; variant: string; fuel: Listing["fuel"]; transmission: Listing["transmission"]; baseL: number };
const OTHER_SPECS: Spec[] = [
  { make: "BMW", model: "520d", variant: "M Sport", fuel: "Diesel", transmission: "Automatic", baseL: 31.4 },
  { make: "BMW", model: "530d", variant: "M Sport", fuel: "Diesel", transmission: "Automatic", baseL: 36.9 },
  { make: "BMW", model: "X1", variant: "sDrive20d", fuel: "Diesel", transmission: "Automatic", baseL: 26.5 },
  { make: "Mercedes-Benz", model: "E220d", variant: "Avantgarde", fuel: "Diesel", transmission: "Automatic", baseL: 26.3 },
  { make: "Audi", model: "Q5", variant: "Premium Plus", fuel: "Diesel", transmission: "Automatic", baseL: 35.2 },
  { make: "Toyota", model: "Fortuner", variant: "4x2 AT", fuel: "Diesel", transmission: "Automatic", baseL: 32.4 },
  { make: "Hyundai", model: "Creta", variant: "SX AT", fuel: "Petrol", transmission: "Automatic", baseL: 14.2 },
  { make: "Maruti Suzuki", model: "Baleno", variant: "Alpha", fuel: "Petrol", transmission: "Manual", baseL: 7.4 },
  { make: "Renault", model: "Kiger", variant: "RXZ", fuel: "Petrol", transmission: "Manual", baseL: 8.6 },
];

function others(): Listing[] {
  const rng = mulberry32(777031);
  const list: Listing[] = [];
  let n = 700;
  for (const spec of OTHER_SPECS) {
    for (let i = 0; i < 22; i += 1) {
      const c = pick(rng, CITIES);
      const year = 2018 + Math.floor(rng() * 5);
      const km = 15000 + Math.floor(rng() * 70) * 1000;
      const ask = Math.round((spec.baseL + (year - 2020) * 0.9 - (km - 45000) / 45000 + REGION_ADJUST[c.region] * 0.4 + (rng() - 0.5) * 2) * 10) / 10;
      const matched = 8 + Math.floor(rng() * 20);
      list.push({
        id: `M-${n++}`, make: spec.make, model: spec.model, variant: spec.variant, year, fuel: spec.fuel, transmission: spec.transmission, km, owners: rng() > 0.6 ? 2 : 1,
        city: c.city, state: c.state, region: c.region, source: rng() > 0.5 ? "Authorised feed A" : "Authorised feed B",
        observedAt: daysBeforeSnapshot(Math.floor(rng() * 20), 9 + Math.floor(rng() * 8), Math.floor(rng() * 60)),
        asking: lakh(Math.max(1.5, ask)), estimate: matched < 10 ? null : lakh(Math.max(1.5, Math.round((spec.baseL + (year - 2020) * 0.9 - (km - 45000) / 45000) * 10) / 10)),
        matched, completeness: matched < 10 ? 0.74 : 0.8 + Math.floor(rng() * 12) / 100, freshestDays: rng() > 0.85 ? 21 : 14, version: "valuation-v1.0",
      });
    }
  }
  return list;
}

export const LISTINGS: Listing[] = [...bmwCohort(), ...others()];

export function searchText(l: Listing): string {
  const series = l.make === "BMW" && /^5\d\dd$/.test(l.model) ? "5 series" : "";
  return `${l.make} ${l.model} ${l.variant} ${series} ${l.city} ${l.state}`.toLowerCase();
}

/** Comparable asks behind the BMW 520d Luxury Line valuation (n = 18, nearest-rank P25 26.8 L, median 29.2 L, P75 31.5 L). */
const BMW_ASKS = [25.9, 26.2, 26.5, 26.6, 26.8, 27.4, 27.9, 28.5, 29.0, 29.4, 29.8, 30.0, 30.4, 31.5, 31.9, 32.4, 32.8, 33.5];
/** Comparable asks behind the Mercedes-Benz E220d valuation (n = 18, P25 25.5 L, median 26.3 L, P75 27.2 L). */
const MERC_ASKS = [24.9, 25.1, 25.2, 25.4, 25.5, 25.7, 25.8, 26.0, 26.2, 26.4, 26.5, 26.6, 26.9, 27.2, 27.3, 27.5, 27.7, 28.2];

export type Comparable = { id: string; asking: number; year: number; km: number; owners: number; city: string; observedAt: string; ageDays: number; source: Listing["source"]; matchedAttributes: string[]; excluded?: string };

function comps(prefix: string, asks: number[], cities: string[], baseYear: number, seed: number): Comparable[] {
  const rng = mulberry32(seed);
  return asks.map((ask, i) => {
    const ageDays = Math.min(14, 1 + Math.floor((i * 14) / asks.length + rng() * 1.5));
    return {
      id: `${prefix}-${i + 1}`, asking: lakh(ask), year: baseYear + (i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2) - (i % 4 === 3 ? 1 : 0), km: 40000 + ((i * 2300) % 40000), owners: i % 5 === 4 ? 2 : 1 + (i % 2),
      city: cities[i % cities.length], observedAt: daysBeforeSnapshot(ageDays, 9 + (i % 7), (i * 7) % 60), ageDays, source: i % 2 ? "Authorised feed B" : "Authorised feed A",
      matchedAttributes: ["Variant", "Year ±1", "Fuel", "Transmission", "km band", "Owner band"],
    };
  });
}

export const BMW_COMPARABLES: Comparable[] = comps("M-C", BMW_ASKS, ["Kochi", "Bengaluru", "Chennai", "Mumbai", "Pune"], 2018, 311);
export const MERC_COMPARABLES: Comparable[] = comps("M-E", MERC_ASKS, ["Kochi", "Bengaluru", "Chennai", "Mumbai"], 2017, 419);

/** Excluded candidates are counted, never silently dropped. */
export const BMW_EXCLUSIONS: { id: string; reason: string }[] = [
  { id: "M-X-1", reason: "Variant not matched (M Sport)" },
  { id: "M-X-2", reason: "Observed more than 14 days ago" },
  { id: "M-X-3", reason: "Odometer outside 40,000-80,000 km band" },
];

export const REGION_STATS: RegionStat[] = [
  { region: "Kochi", state: "Kerala", n: 18, median: lakh(29.2), q1: lakh(27.8), q3: lakh(30.5), observedAt: ist(2026, 10, 19, 9, 10), completeness: 0.86, freshestDays: 14, transport: 0, fees: 0, status: "ok" },
  { region: "Bengaluru", state: "Karnataka", n: 24, median: lakh(28.1), q1: lakh(26.9), q3: lakh(29.8), observedAt: ist(2026, 10, 19, 8, 40), completeness: 0.88, freshestDays: 14, transport: lakh(0.4), fees: lakh(0.2), status: "ok" },
  { region: "Chennai", state: "Tamil Nadu", n: 16, median: lakh(28.6), q1: lakh(27.1), q3: lakh(29.9), observedAt: ist(2026, 10, 18, 17, 5), completeness: 0.84, freshestDays: 14, transport: lakh(0.35), fees: lakh(0.2), status: "ok" },
  { region: "Mumbai", state: "Maharashtra", n: 21, median: lakh(30.0), q1: lakh(28.3), q3: lakh(31.2), observedAt: ist(2026, 10, 18, 12, 30), completeness: 0.87, freshestDays: 14, transport: lakh(0.9), fees: lakh(0.25), status: "ok" },
  { region: "Pune", state: "Maharashtra", n: 7, median: lakh(29.0), q1: lakh(27.8), q3: lakh(29.4), observedAt: ist(2026, 10, 17, 10, 20), completeness: 0.82, freshestDays: 14, transport: lakh(0.8), fees: lakh(0.2), status: "ok" },
  { region: "Hyderabad", state: "Telangana", n: 0, median: null, q1: null, q3: null, observedAt: null, completeness: 0, freshestDays: 0, transport: lakh(0.6), fees: lakh(0.2), status: "unavailable" },
];

export const BASE_REGION = "Kochi";

/** Observed ask history for listing M-501 (gaps are real gaps, not zeros). */
export const M501_PRICE_HISTORY: { at: string; ask: number | null }[] = [
  { at: daysBeforeSnapshot(13), ask: lakh(29.5) },
  { at: daysBeforeSnapshot(10), ask: lakh(29.5) },
  { at: daysBeforeSnapshot(7), ask: null },
  { at: daysBeforeSnapshot(4), ask: lakh(28.9) },
  { at: daysBeforeSnapshot(0, 9, 10), ask: lakh(28.5) },
];
