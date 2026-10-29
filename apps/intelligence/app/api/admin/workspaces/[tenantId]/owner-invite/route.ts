import { json, problem, rateLimited, readJson } from "@/lib/api";
import { hitShared } from "@/lib/rate-limit";
import { adminApi } from "@/lib/server/admin-gate";
import { isUuid } from "@/lib/server/db";
import { reissueOwnerInvite } from "@/lib/server/platform-admin";

export const dynamic = "force-dynamic";

/** New owner setup link for a workspace nobody has joined yet. Earlier unused links stop working. */
export async function POST(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const gate = await adminApi(request, { reauth: true });
  if (gate.error) return gate.error;
  const limit = await hitShared(`owner-invite:${gate.access.userId}`, 10, 60 * 60_000);
  if (!limit.allowed) return rateLimited("Too many setup links issued. Try again later.", limit.retryAfter);
  const { tenantId } = await context.params;
  const body = await readJson<{ ownerEmail?: string; ownerName?: string }>(request);
  const email = typeof body?.ownerEmail === "string" ? body.ownerEmail.trim() : "";
  const name = typeof body?.ownerName === "string" ? body.ownerName.trim() : "";
  if (!isUuid(tenantId) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || name.length < 2) return problem(422, "invalid", "Enter the owner's name and email.", { fields: { ownerEmail: "Enter the owner's email address." } });
  const result = await reissueOwnerInvite(gate.access.userId, tenantId, email, name);
  if (!result) return problem(409, "conflict", "Someone has already joined this workspace. Their owner can invite people from Settings, Team.");
  return json({ setupPath: `/join/${result.token}`, expiresAt: result.expiresAt });
}
