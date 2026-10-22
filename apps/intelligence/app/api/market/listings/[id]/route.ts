import { currentSession, envelope, json, problem } from "@/lib/api";
import { decorate } from "@/lib/market";
import { LISTINGS } from "@/lib/fixtures/market";
import { can } from "@/lib/permissions";
import { valuationForListing } from "@/lib/valuation";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await currentSession();
  if (!session) return problem(401, "unauthenticated", "Sign in to continue.");
  if (!can(session.role, "market.view")) return problem(403, "forbidden", "Your role cannot view market listings.");
  const { id } = await context.params;
  const listing = LISTINGS.find((l) => l.id === id);
  if (!listing) return problem(404, "not_found", "Listing unavailable or withdrawn.");
  const url = new URL(request.url);
  return json(envelope(session, url.searchParams.get("branch") ?? "koc", { listing: decorate(listing, "Kochi"), valuation: valuationForListing(listing) }));
}
