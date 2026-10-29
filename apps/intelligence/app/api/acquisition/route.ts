import { json, problem, rateLimited, readJson } from "@/lib/api";
import { can } from "@/lib/permissions";
import { clientKey, hitShared } from "@/lib/rate-limit";
import { readRoute } from "@/lib/server/read-api";
import { getPrincipal } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/csrf";
import { tenantTx } from "@/lib/server/db";
import { readEntitlements } from "@/lib/server/entitlement-store";
import { acquisitionInput, acquisitionOverview, CommerceError, runAcquisition } from "@/lib/server/acquisition-store";
import { auditRuleChange } from "@/lib/server/automation-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return readRoute(request, "acquisition.review", ({ c, principal }) => acquisitionOverview(c, principal.tenantId), "acquisition");
}

/** Calculates budget-fit acquisitions from the dealership's approved sourcing data. Metered against the subscription. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Sign in to continue.");
  const { principal } = current;
  if (!can(principal.role, "acquisition.review")) return problem(403, "forbidden", "Your role cannot run acquisition research.");
  const limit = await hitShared(`acquisition:${principal.userId}:${clientKey(request)}`, 20, 60_000);
  if (!limit.allowed) return rateLimited("Too many calculations. Wait a moment.", limit.retryAfter);
  const body = await readJson<unknown>(request, 10_000);
  let input: ReturnType<typeof acquisitionInput>;
  try { input = acquisitionInput(body); } catch (error) { return problem(422, "invalid", error instanceof CommerceError ? error.message : "Check the numbers entered."); }
  try {
    const report = await tenantTx(principal.tenantId, async (c) => {
      const entitlements = await readEntitlements(c, principal.tenantId);
      if (!entitlements.features.acquisition.enabled) throw new CommerceError(403, entitlements.features.acquisition.reason);
      const result = await runAcquisition(c, principal.tenantId, input);
      await auditRuleChange(c, principal.tenantId, principal.name, "acquisition.calculated", input.city, `Budget ${input.budget}, ${input.count} car${input.count > 1 ? "s" : ""}, ${result.options.length} options`);
      return result;
    });
    return json(report);
  } catch (error) {
    if (error instanceof CommerceError) return error.status === 429 ? rateLimited(error.message, error.retryAfter ?? 60) : problem(error.status === 402 ? 403 : error.status, error.status === 402 ? "not_entitled" : "invalid", error.message);
    console.error(JSON.stringify({ event: "acquisition_failure", user: principal.userId, message: error instanceof Error ? error.message : "unknown" }));
    return problem(500, "failed", "The calculation failed. Nothing was counted against your allowance. Try again.");
  }
}
