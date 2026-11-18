import { currentSession, envelope, json, problem } from "@/lib/api";
import { can } from "@/lib/permissions";
import { plain } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/** Returns real, approved observations only. No demo records or inferred valuations. */
export async function GET(request: Request) {
  const session = await currentSession();
  if (!session) return problem(401, "unauthenticated", "Sign in to continue.");
  if (!can(session.role, "market.view")) return problem(403, "forbidden", "Your role cannot view market listings.");

  const params = new URL(request.url).searchParams;
  const bounded = (key: string, max: number) => (params.get(key) ?? "").trim().slice(0, max);
  const make = bounded("make", 80);
  const model = bounded("model", 100);
  const city = bounded("city", 100);
  const fuel = bounded("fuel", 30);
  const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 25));
  const cursor = Math.min(100000, Math.max(0, Number(params.get("cursor")) || 0));
  if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(cursor)) return problem(400, "invalid_query", "Invalid pagination.");
  const query = `FROM intelligence_market_observations_live()
    WHERE ($1 = '' OR lower(make) = lower($1))
      AND ($2 = '' OR lower(model) = lower($2))
      AND ($3 = '' OR lower(city) = lower($3))
      AND ($4 = '' OR lower(fuel) = lower($4))`;
  try {
    const result = await plain(async (client) => {
      const values = [make, model, city, fuel];
      const count = await client.query(`SELECT count(*)::int AS n ${query}`, values);
      const records = await client.query(`SELECT * ${query}
        ORDER BY observed_at DESC, listing_id LIMIT $5 OFFSET $6`, [...values, limit, cursor]);
      return { total: Number(count.rows[0]?.n ?? 0), rows: records.rows };
    });
    const listings = result.rows.map((r) => ({
      id: String(r.listing_id),
      make: String(r.make), model: String(r.model), variant: String(r.variant ?? ""),
      year: r.year === null ? null : Number(r.year),
      fuel: String(r.fuel ?? ""), transmission: String(r.transmission ?? ""),
      km: r.km === null ? null : Number(r.km),
      owners: r.owners === null ? null : Number(r.owners),
      city: String(r.city), state: String(r.state ?? ""),
      asking: r.asking_price_inr === null ? null : Number(r.asking_price_inr),
      estimate: null, matched: 0, completeness: null, distanceKm: null,
      source: String(r.source_name), sourceUrl: r.source_url ? String(r.source_url) : null,
      observedAt: new Date(String(r.observed_at)).toISOString(),
      evidence: "observed_asking_price",
    }));
    return json(envelope(session, bounded("branch", 80), {
      listings, total: result.total, next_cursor: cursor + listings.length < result.total ? cursor + listings.length : null,
      ...(result.total === 0 ? { setup_required: "No active authorized used-car data has been imported." } : {}),
      notices: ["Prices are asking prices, not verified sale prices.", "Records may represent duplicate physical cars.", "No model valuation is inferred from imported listings."],
    }, result.total ? "partial" : "unavailable"));
  } catch {
    return problem(503, "market_data_unavailable", "Market database is not ready. Apply migration 0023 and check connection.");
  }
}
