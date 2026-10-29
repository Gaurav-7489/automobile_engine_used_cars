import { choice, intParam, readRoute } from "@/lib/server/read-api";
import { listVehicles } from "@/lib/server/read-queries";

export const dynamic = "force-dynamic";

const TABS = ["all", "available", "reserved", "preparation", "sold", "archived"] as const;

/** One page of stock for the signed-in member's branches: filtered, sorted and counted in the database. */
export async function GET(request: Request) {
  return readRoute(request, "inventory.view", async ({ c, principal, branchIds, url }) => {
    const p = url.searchParams;
    return listVehicles(c, principal.tenantId, branchIds, {
      tab: choice(p.get("tab"), TABS, "all"), q: (p.get("q") ?? "").slice(0, 80), make: (p.get("make") ?? "").slice(0, 60) || undefined, age: choice(p.get("age"), ["", "0-15", "16-30", "31-45", ">45"] as const, "") || undefined,
      vbranch: p.get("vbranch") && branchIds.includes(p.get("vbranch")!) ? p.get("vbranch")! : undefined, flag: choice(p.get("flag"), ["", "cost", "media", "review", "priced", "costok"] as const, ""),
      sort: choice(p.get("sort"), ["", "year", "km", "landed", "asking", "age"] as const, ""), dir: choice(p.get("dir"), ["asc", "desc"] as const, "asc"),
      page: intParam(url, "page", 1, 1, 100_000), size: intParam(url, "size", 25, 1, 200),
    });
  }, "inventory");
}
