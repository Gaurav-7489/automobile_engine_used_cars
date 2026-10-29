import { json, problem } from "@/lib/api";
import { adminApi } from "@/lib/server/admin-gate";
import { isUuid } from "@/lib/server/db";
import { adminAudit } from "@/lib/server/entitlement-store";

export const dynamic = "force-dynamic";

/** Platform audit trail across dealerships, newest first. Platform administrators only. */
export async function GET(request: Request) {
  const gate = await adminApi(null);
  if (gate.error) return gate.error;
  const p = new URL(request.url).searchParams;
  const tenant = p.get("tenant");
  if (tenant && !isUuid(tenant)) return problem(422, "invalid", "Unknown dealership.");
  const page = Math.max(1, Math.min(100_000, Number(p.get("page")) || 1));
  const size = Math.max(1, Math.min(100, Number(p.get("size")) || 50));
  return json(await adminAudit(gate.access.userId, { tenantId: tenant ?? undefined, action: (p.get("action") ?? "").slice(0, 80) || undefined, q: (p.get("q") ?? "").trim().slice(0, 80), page, size }));
}
