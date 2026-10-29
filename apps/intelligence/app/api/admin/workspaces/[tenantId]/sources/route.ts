import { json, problem, rateLimited, readJson } from "@/lib/api";
import { adminApi } from "@/lib/server/admin-gate";
import { isUuid } from "@/lib/server/db";
import { adminSetSource, validateSourceInput, type SourceInput } from "@/lib/server/entitlement-store";
import { hitShared } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Approves, changes or disables one sourcing data source for a dealership. Needs a recent password confirmation; audited. */
export async function POST(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const gate = await adminApi(request, { reauth: true });
  if (gate.error) return gate.error;
  const limit = await hitShared(`admin-sources:${gate.access.userId}`, 30, 10 * 60_000);
  if (!limit.allowed) return rateLimited("Too many source changes. Wait a few minutes.", limit.retryAfter);
  const { tenantId } = await context.params;
  if (!isUuid(tenantId)) return problem(404, "not_found", "Not found.");
  const body = await readJson<Partial<SourceInput>>(request, 4_000);
  if (!body) return problem(422, "invalid", "Send the source.");
  const checked = validateSourceInput(body);
  if ("fields" in checked) return problem(422, "invalid", "Fix the highlighted fields.", { fields: checked.fields });
  try {
    if (!(await adminSetSource(gate.access.userId, tenantId, checked.source))) return problem(404, "not_found", "That dealership was not found. Nothing was changed.");
  } catch { return problem(409, "invalid", "The source was refused (for example, too many sources). Nothing was changed."); }
  return json({ ok: true });
}
