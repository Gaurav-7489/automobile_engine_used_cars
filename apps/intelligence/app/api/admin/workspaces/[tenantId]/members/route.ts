import { json, problem } from "@/lib/api";
import { adminApi } from "@/lib/server/admin-gate";
import { isUuid } from "@/lib/server/db";
import { listMembers } from "@/lib/server/platform-admin";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const gate = await adminApi(null);
  if (gate.error) return gate.error;
  const { tenantId } = await context.params;
  if (!isUuid(tenantId)) return problem(404, "not_found", "Not found.");
  return json({ members: await listMembers(gate.access.userId, tenantId) });
}
