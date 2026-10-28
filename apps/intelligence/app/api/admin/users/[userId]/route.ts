import { json, problem, readJson } from "@/lib/api";
import { adminApi } from "@/lib/server/admin-gate";
import { isUuid } from "@/lib/server/db";
import { setSuspended } from "@/lib/server/platform-admin";

export const dynamic = "force-dynamic";

/** Suspend or restore an account across every workspace. Suspension signs the person out everywhere at once. */
export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  const gate = await adminApi(request, { reauth: true });
  if (gate.error) return gate.error;
  const { userId } = await context.params;
  const body = await readJson<{ suspended?: boolean; reason?: string }>(request);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!isUuid(userId) || typeof body?.suspended !== "boolean") return problem(422, "invalid", "Unknown request.");
  if (body.suspended && reason.length < 5) return problem(422, "invalid", "Give a reason for the audit log.", { fields: { reason: "Give a reason (at least 5 characters)." } });
  const ok = await setSuspended(gate.access.userId, userId, body.suspended, reason);
  return ok ? json({ ok: true }) : problem(409, "conflict", "This account cannot be changed here. Administrators cannot suspend themselves or another administrator.");
}
