import { json, problem } from "@/lib/api";
import { can } from "@/lib/permissions";
import { getPrincipal } from "@/lib/server/auth";
import { websitePerformance } from "@/lib/server/website-analytics";

export const dynamic = "force-dynamic";

/** The dealership's own website report (visits, car views, enquiries, sources). Counts only; no visitor or customer details. */
export async function GET(request: Request) {
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Your session has expired. Sign in again.");
  if (!can(current.principal.role, "reports.view")) return problem(403, "forbidden", "Your role cannot view reports.");
  const days = Number(new URL(request.url).searchParams.get("days") ?? 30) || 30;
  try {
    return json(await websitePerformance(current.principal.tenantId, days));
  } catch (error) {
    console.error(JSON.stringify({ event: "website_performance_failure", message: error instanceof Error ? error.message : "unknown" }));
    return problem(500, "failed", "We could not load website performance. Try again.");
  }
}
