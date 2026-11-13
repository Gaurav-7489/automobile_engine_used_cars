import { json, problem } from "@/lib/api";
import { adminApi } from "@/lib/server/admin-gate";
import { healthReview } from "@/lib/server/health-review";

export const dynamic = "force-dynamic";

/** Customer health review for every dealership: counts and ratings only. Platform administrators with two-factor login. */
export async function GET() {
  const gate = await adminApi(null);
  if ("error" in gate) return gate.error;
  try {
    return json({ rows: await healthReview(gate.access.userId), checkedAt: new Date().toISOString() });
  } catch (error) {
    console.error(JSON.stringify({ event: "health_review_failure", message: error instanceof Error ? error.message : "unknown" }));
    return problem(500, "failed", "The health review could not load.");
  }
}
