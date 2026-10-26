import type { CommerceState } from "@vandlabs/contracts";
import { CommerceError, eligibleVehicles, number, text } from "./commerce-rules";

/** Descriptive asking-price statistics, never a transaction valuation or demand forecast. */
export function marketReport(state: CommerceState, input: Record<string, unknown>, now: Date) {
  const string = (key: string) => input[key] === undefined || input[key] === "" ? "" : text(input[key]);
  const numeric = (key: string, min: number, max: number, fallback: number) => {
    const value = input[key];
    if (value === undefined || value === "") return fallback;
    if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") throw new CommerceError(400, `Invalid ${key}.`);
    return number(Number(value), min, max, true);
  };
  const filters = {
    make: string("make"), model: string("model"), city: string("city"), sourceId: string("sourceId"),
    fuel: string("fuel"), transmission: string("transmission"),
    minYear: numeric("minYear", 1900, now.getUTCFullYear() + 1, 1900),
    maxYear: numeric("maxYear", 1900, now.getUTCFullYear() + 1, now.getUTCFullYear() + 1),
    maxKm: numeric("maxKm", 0, 2000000, 2000000),
    minPrice: numeric("minPrice", 0, 100000000, 0), maxPrice: numeric("maxPrice", 0, 100000000, 100000000),
    maxAgeDays: numeric("maxAgeDays", 1, 90, 7), page: numeric("page", 1, 100, 1),
  };
  if (filters.minYear > filters.maxYear || filters.minPrice > filters.maxPrice) throw new CommerceError(400, "Minimum cannot exceed maximum.");
  if (!["", "petrol", "diesel", "electric", "hybrid"].includes(filters.fuel) || !["", "manual", "automatic"].includes(filters.transmission)) throw new CommerceError(400, "Unknown fuel or transmission filter.");
  const equal = (value: string, filter: string) => !filter || value.toLowerCase() === filter.toLowerCase();
  const eligible = eligibleVehicles(state, false, now).filter(v => equal(v.make, filters.make) && equal(v.model, filters.model) && equal(v.city, filters.city) && equal(v.sourceId, filters.sourceId) && equal(v.fuel, filters.fuel) && equal(v.transmission, filters.transmission) && v.year >= filters.minYear && v.year <= filters.maxYear && v.odometerKm <= filters.maxKm);
  const cutoff = now.getTime() - filters.maxAgeDays * 86400000;
  const priced = eligible.filter(v => v.askingPrice && Number.isSafeInteger(v.askingPrice.amount) && v.askingPrice.amount > 0 && v.askingPrice.currency === "INR" && Date.parse(v.askingPrice.observedAt) >= cutoff && Date.parse(v.askingPrice.observedAt) <= now.getTime());
  const matched = priced.filter(v => v.askingPrice!.amount >= filters.minPrice && v.askingPrice!.amount <= filters.maxPrice);
  const percentile = (values: number[], fraction: number) => {
    if (!values.length) return null;
    const index = (values.length - 1) * fraction, lower = Math.floor(index);
    return Math.round((values[lower] + (values[Math.ceil(index)] - values[lower]) * (index - lower)) * 100) / 100;
  };
  const stats = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return { count: sorted.length, min: sorted[0] ?? null, q1: percentile(sorted, .25), median: percentile(sorted, .5), q3: percentile(sorted, .75), max: sorted.at(-1) ?? null };
  };
  const distribution = stats(matched.map(v => v.askingPrice!.amount));
  const cities = new Map<string, { city: string; prices: number[] }>();
  for (const v of matched) {
    const key = v.city.toLowerCase(), city = cities.get(key) ?? { city: v.city, prices: [] };
    city.prices.push(v.askingPrice!.amount); cities.set(key, city);
  }
  const sourceIds = new Set(matched.map(v => v.sourceId));
  const dates = matched.map(v => v.askingPrice!.observedAt).sort((a, b) => Date.parse(a) - Date.parse(b));
  const notices = [
    "Asking prices are advertised amounts, not verified sale prices or guaranteed resale values.",
    "Source records may describe the same physical vehicle. Counts are records, not verified unique vehicles.",
    "Regional medians reflect the selected vehicle mix; they are not adjusted valuations or arbitrage recommendations.",
    "No verified transaction history, historical trend, sale velocity or market-wide demand inference is available here.",
  ];
  if (matched.length < 5) notices.unshift("Limited evidence: fewer than five asking-price records match. No reliable market valuation can be inferred.");
  if (!filters.make || !filters.model || filters.minYear !== filters.maxYear) notices.unshift("Mixed vehicle cohorts: narrow make, model and year before comparing prices.");
  if (eligible.length > priced.length) notices.push(`${eligible.length - priced.length} eligible records lack valid asking prices within the selected freshness window.`);
  const items = [...matched].sort((a, b) => b.askingPrice!.amount - a.askingPrice!.amount || a.id.localeCompare(b.id)).slice((filters.page - 1) * 25, filters.page * 25).map(v => ({
    id: v.id, make: v.make, model: v.model, year: v.year, city: v.city, fuel: v.fuel, transmission: v.transmission, odometerKm: v.odometerKm,
    askingPrice: v.askingPrice!, source: state.sources.find(s => s.id === v.sourceId)!.name, evidence: v.evidence,
    demo: state.sources.find(s => s.id === v.sourceId)!.kind === "demo",
  }));
  // Evidence quality: a rule over the records themselves (count, sources, cohort narrowness, age). It rates the evidence, never the market.
  const narrow = Boolean(filters.make && filters.model && filters.minYear === filters.maxYear);
  const ageDays = (iso: string | undefined) => iso === undefined ? null : Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 86400000 * 10) / 10);
  const reasons: string[] = [`${matched.length} matching ${matched.length === 1 ? "record" : "records"} from ${sourceIds.size} ${sourceIds.size === 1 ? "source" : "sources"}`];
  reasons.push(narrow ? "Single make, model and year cohort" : "Mixed cohort — narrow make, model and year");
  const oldest = ageDays(dates[0]), newest = ageDays(dates.at(-1));
  if (oldest !== null) reasons.push(`Observations are ${newest} to ${oldest} days old`);
  const level = matched.length < 5 ? "insufficient" : matched.length >= 15 && sourceIds.size >= 2 && narrow ? "high" : matched.length >= 8 && narrow ? "medium" : "low";
  const overall = distribution.median;
  return {
    generatedAt: now.toISOString(), currency: "INR" as const, filters, distribution,
    confidence: { level: level as "insufficient" | "low" | "medium" | "high", reasons, narrowCohort: narrow },
    freshness: { newestAgeDays: newest, oldestAgeDays: oldest, windowDays: filters.maxAgeDays, withinWindow: priced.length, excludedStale: eligible.filter(v => v.askingPrice && Date.parse(v.askingPrice.observedAt) < cutoff).length },
    coverage: { eligible: eligible.length, freshAskingPrices: priced.length, matching: matched.length, sources: sourceIds.size, oldestObservationAt: dates[0] ?? null, latestObservationAt: dates.at(-1) ?? null },
    cities: [...cities.values()].map(c => { const st = stats(c.prices); return { city: c.city, ...st, vsOverallPercent: overall && st.median !== null && matched.length >= 5 && c.prices.length >= 2 ? Math.round((st.median - overall) / overall * 1000) / 10 : null }; }).sort((a, b) => a.city.localeCompare(b.city)),
    demo: matched.some(v => state.sources.find(s => s.id === v.sourceId)!.kind === "demo"),
    items, pageSize: 25, notices,
  };
}
