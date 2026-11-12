import { plain } from "./db";

/**
 * What a model is listed for in each state, from the cars dealerships on VandLabs have published. These are asking prices,
 * not sale prices, and a state with only a few cars is marked so nobody reads a single listing as a market.
 */
export type StatePrice = { state: string; cars: number; dealers: number; median: number; low: number; high: number; thin: boolean; vsHome: number | null };
export type StatePrices = { make: string; model: string; home: string; states: StatePrice[]; models: { make: string; model: string; cars: number }[]; totalCars: number };

/** Fewer cars than this and the figure is a handful of listings, not a typical price. */
export const THIN_SAMPLE = 5;

const clean = (v: string | null | undefined) => (v ?? "").trim().slice(0, 40);

export async function readStatePrices(input: { make?: string | null; model?: string | null; home?: string | null }): Promise<StatePrices> {
  const make = clean(input.make), model = clean(input.model), home = clean(input.home);
  return plain(async (c) => {
    const models = ((await c.query("SELECT make, model, cars FROM intelligence_state_price_models() ORDER BY cars DESC, make, model LIMIT 300")).rows as { make: string; model: string; cars: number }[])
      .map((r) => ({ make: String(r.make), model: String(r.model), cars: Number(r.cars) }));
    const rows = (await c.query("SELECT * FROM intelligence_state_prices($1, $2)", [make, model])).rows as Record<string, unknown>[];
    const base = rows.find((r) => String(r.state).toLowerCase() === home.toLowerCase());
    const homeMedian = base ? Number(base.median) : null;
    const states = rows.map((r) => {
      const median = Math.round(Number(r.median));
      return {
        state: String(r.state), cars: Number(r.cars), dealers: Number(r.dealers), median, low: Math.round(Number(r.low)), high: Math.round(Number(r.high)), thin: Number(r.cars) < THIN_SAMPLE,
        vsHome: homeMedian && homeMedian > 0 ? Math.round(((median - homeMedian) / homeMedian) * 1000) / 10 : null,
      };
    }).sort((a, b) => a.median - b.median || a.state.localeCompare(b.state));
    return { make, model, home: base ? String(base.state) : home, states, models, totalCars: states.reduce((a, s) => a + s.cars, 0) };
  });
}
