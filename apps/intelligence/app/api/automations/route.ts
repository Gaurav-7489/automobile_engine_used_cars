import { intParam, readRoute } from "@/lib/server/read-api";
import { listRules, recentRuns } from "@/lib/server/automation-store";
import type { RunOutcome } from "@/lib/automation";
import { ruleMutation } from "@/lib/server/automation-api";

export const dynamic = "force-dynamic";
const OUTCOMES = ["created", "skipped_consent", "skipped_provider", "skipped_duplicate"];

/** Rules and a page of recorded runs for this dealership. */
export async function GET(request: Request) {
  return readRoute(request, "automations.view", async ({ c, principal, url }) => {
    const outcome = url.searchParams.get("outcome") ?? "";
    const rule = (url.searchParams.get("rule") ?? "").slice(0, 60);
    const [rules, runs] = await Promise.all([listRules(c, principal.tenantId), recentRuns(c, principal.tenantId, { ruleId: rule || undefined, outcome: OUTCOMES.includes(outcome) ? (outcome as RunOutcome) : undefined, page: intParam(url, "page", 1, 1, 100_000), size: intParam(url, "size", 25, 1, 100) })]);
    return { rules, ...runs };
  }, "automations");
}

export async function POST(request: Request) {
  return ruleMutation(request, null, "save");
}
