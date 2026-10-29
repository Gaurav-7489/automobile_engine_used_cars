import { json, problem, rateLimited, readJson } from "@/lib/api";
import { adminApi } from "@/lib/server/admin-gate";
import { isUuid } from "@/lib/server/db";
import { adminReadCommerce, adminSetEntitlements, validateEntitlementInput, type EntitlementInput } from "@/lib/server/entitlement-store";
import { hitShared } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const gate = await adminApi(null);
  if (gate.error) return gate.error;
  const { tenantId } = await context.params;
  if (!isUuid(tenantId)) return problem(404, "not_found", "Not found.");
  const commerce = await adminReadCommerce(gate.access.userId, tenantId);
  return commerce ? json(commerce) : problem(404, "not_found", "Not found.");
}

/** Sets a dealership's subscription and feature switches. Needs a recent password confirmation; every change is audited. */
export async function POST(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const gate = await adminApi(request, { reauth: true });
  if (gate.error) return gate.error;
  const limit = await hitShared(`admin-entitlements:${gate.access.userId}`, 30, 10 * 60_000);
  if (!limit.allowed) return rateLimited("Too many access changes. Wait a few minutes.", limit.retryAfter);
  const { tenantId } = await context.params;
  if (!isUuid(tenantId)) return problem(404, "not_found", "Not found.");
  const body = await readJson<EntitlementInput>(request);
  if (!body || typeof body.features !== "object") return problem(422, "invalid", "Send the subscription and features.");
  const checked = validateEntitlementInput(body);
  if ("fields" in checked) return problem(422, "invalid", "Fix the highlighted fields.", { fields: checked.fields });
  if (!(await adminSetEntitlements(gate.access.userId, tenantId, checked.subscription, checked.features))) return problem(404, "not_found", "That dealership was not found. Nothing was changed.");
  return json({ ok: true, commerce: await adminReadCommerce(gate.access.userId, tenantId) });
}
