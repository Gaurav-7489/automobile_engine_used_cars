import { currentSession, envelope, json, problem } from "@/lib/api";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await currentSession();
  if (!session) return problem(401, "unauthenticated", "Sign in to continue.");
  if (!can(session.role, "market.view")) return problem(403, "forbidden", "Your role cannot view market data.");
  return json(envelope(session, "", { regions: [], setup_required: "A licensed market-data feed is not connected." }, "unavailable"));
}
