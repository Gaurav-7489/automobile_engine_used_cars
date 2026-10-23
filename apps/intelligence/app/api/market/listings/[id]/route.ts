import { currentSession, problem } from "@/lib/api";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await currentSession();
  if (!session) return problem(401, "unauthenticated", "Sign in to continue.");
  if (!can(session.role, "market.view")) return problem(403, "forbidden", "Your role cannot view market listings.");
  return problem(404, "not_found", "Listing unavailable. No licensed market-data feed is connected.");
}
