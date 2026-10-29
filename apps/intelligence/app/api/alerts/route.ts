import { istDate } from "@/lib/server/ids";
import { alertCounts, sortAlerts } from "@/lib/selectors";
import { choice, intParam, readRoute } from "@/lib/server/read-api";
import { scopedAlerts } from "@/lib/server/overview-model";

export const dynamic = "force-dynamic";

/** The alert queue for the member's branches: filtered, sorted and paged on the server, with counts that ignore the filters. */
export async function GET(request: Request) {
  return readRoute(request, "alerts.view", async ({ c, principal, branchIds, url }) => {
    const p = url.searchParams;
    const all = await scopedAlerts(c, principal.tenantId, branchIds);
    const id = p.get("id");
    if (id) return { alerts: all.filter((a) => a.id === id), total: 1, page: 1, size: 1, counts: alertCounts(all), people: [] };
    const status = ({ open: "Open", snoozed: "Snoozed", resolved: "Resolved" } as const)[choice(p.get("tab"), ["open", "snoozed", "resolved"] as const, "open")];
    const now = new Date();
    const mine = p.get("mine") === "1";
    const rows = sortAlerts(all.filter((a) => a.status === status)).filter((a) => {
      if (p.get("type") && a.type !== p.get("type")) return false;
      if (p.get("severity") && a.severity !== p.get("severity")) return false;
      if (p.get("assignee") && a.assignee !== p.get("assignee")) return false;
      if (mine && a.assignee !== principal.name) return false;
      if (p.get("due") === "today" && !(a.dueAt && istDate(a.dueAt) === istDate(now.toISOString()))) return false;
      if (p.get("due") === "overdue" && !(a.dueAt && new Date(a.dueAt).getTime() < now.getTime())) return false;
      if (p.get("waiting") === "1" && !a.waiting) return false;
      return true;
    });
    const size = intParam(url, "size", 50, 1, 200);
    const page = Math.min(intParam(url, "page", 1, 1, 100_000), Math.max(1, Math.ceil(rows.length / size)));
    return { alerts: rows.slice((page - 1) * size, page * size), total: rows.length, page, size, counts: alertCounts(all), people: [...new Set(all.map((a) => a.assignee))].sort() };
  }, "alerts");
}

