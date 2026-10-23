import { currentSession, envelope, json, problem } from "@/lib/api";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** No licensed market-data provider is connected, so there are no listings. This reports the gap instead of inventing data. */
export async function GET(request: Request) {
  const session = await currentSession();
  if (!session) return problem(401, "unauthenticated", "Sign in to continue.");
  if (!can(session.role, "market.view")) return problem(403, "forbidden", "Your role cannot view market listings.");
  const branch = new URL(request.url).searchParams.get("branch") ?? "";
  return json({ ...envelope(session, branch, { listings: [], total: 0, next_cursor: null, setup_required: "A licensed market-data feed is not connected." }, "unavailable") }, { status: 200 });
}
