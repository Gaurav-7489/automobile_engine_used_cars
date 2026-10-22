import { currentSession, envelope, json, problem } from "@/lib/api";
import { DEFAULT_COHORT, regionStats, type CohortFilter } from "@/lib/market";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const n = (value: string | null, fallback: number) => (value && /^\d+$/.test(value) ? Number(value) : fallback);

export async function GET(request: Request) {
  const session = await currentSession();
  if (!session) return problem(401, "unauthenticated", "Sign in to continue.");
  if (!can(session.role, "market.view")) return problem(403, "forbidden", "Your role cannot view market data.");
  const url = new URL(request.url);
  const p = url.searchParams;
  const cohort: CohortFilter = {
    make: p.get("make") ?? DEFAULT_COHORT.make, model: p.get("model") ?? DEFAULT_COHORT.model, variant: p.get("variant") ?? DEFAULT_COHORT.variant, fuel: p.get("fuel") ?? DEFAULT_COHORT.fuel,
    transmission: p.get("transmission") ?? DEFAULT_COHORT.transmission, yearFrom: n(p.get("yearFrom"), DEFAULT_COHORT.yearFrom), yearTo: n(p.get("yearTo"), DEFAULT_COHORT.yearTo),
    kmMin: n(p.get("kmMin"), DEFAULT_COHORT.kmMin), kmMax: n(p.get("kmMax"), DEFAULT_COHORT.kmMax), ownersMax: n(p.get("owners"), DEFAULT_COHORT.ownersMax), windowDays: n(p.get("window"), DEFAULT_COHORT.windowDays),
  };
  const { stats, excluded, computed } = regionStats(cohort);
  return json(envelope(session, "koc", { cohort, regions: stats, excluded_unknown_match_fields: excluded, computed_from_listings: computed, caveat: "Asking-price comparisons. Adjusted estimate is a separate model output." }));
}
