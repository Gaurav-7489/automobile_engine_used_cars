import { currentSession, envelope, json, problem } from "@/lib/api";
import { OPPORTUNITY_RULE_VERSION, parseMarketQuery, queryListings } from "@/lib/market";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await currentSession();
  if (!session) return problem(401, "unauthenticated", "Sign in to continue.");
  if (!can(session.role, "market.view")) return problem(403, "forbidden", "Your role cannot view market listings.");
  const url = new URL(request.url);
  const query = parseMarketQuery(url.searchParams);
  const { rows, total, next } = queryListings(query, url.searchParams.get("base") ?? "Kochi");
  return json({ ...envelope(session, url.searchParams.get("branch") ?? "koc", { listings: rows, total, next_cursor: next, rule_version: OPPORTUNITY_RULE_VERSION }), });
}
