import { json, problem } from "@/lib/api";
import { can } from "@/lib/permissions";
import { getPrincipal } from "@/lib/server/auth";
import { tenantTx } from "@/lib/server/db";
import { readStatePrices } from "@/lib/server/state-prices";

export const dynamic = "force-dynamic";

/** Asking prices by state for one make and model. The dealership's own state is the comparison base. */
export async function GET(request: Request) {
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Your session has expired. Sign in again.");
  if (!can(current.principal.role, "market.view")) return problem(403, "forbidden", "Your role cannot view market prices.");
  const url = new URL(request.url);
  try {
    const home = (await tenantTx(current.principal.tenantId, (c) => c.query("SELECT state FROM locations WHERE tenant_id = $1 AND id = ANY($2::uuid[]) ORDER BY name, id LIMIT 1", [current.principal.tenantId, current.principal.locationIds]))).rows[0]?.state as string | undefined;
    return json(await readStatePrices({ make: url.searchParams.get("make"), model: url.searchParams.get("model"), home: url.searchParams.get("home") || home }));
  } catch (error) {
    console.error(JSON.stringify({ event: "state_prices_failure", message: error instanceof Error ? error.message : "unknown" }));
    return problem(500, "failed", "We could not load prices by state. Try again.");
  }
}
