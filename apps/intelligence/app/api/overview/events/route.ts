import { choice, readRoute } from "@/lib/server/read-api";
import { eventsForMonthSql } from "@/lib/server/overview-model";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return readRoute(request, null, async ({ c, principal, branchIds, url }) => {
    const month = url.searchParams.get("month") ?? "";
    if (!/^\d{4}-\d{2}$/.test(month)) return { events: [] };
    const type = choice(url.searchParams.get("type"), ["", "acquired", "sold"] as const, "") || undefined;
    return { events: await eventsForMonthSql(c, principal.tenantId, branchIds, month, type) };
  });
}
