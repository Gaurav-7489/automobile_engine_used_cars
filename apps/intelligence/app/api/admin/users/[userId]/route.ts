import { json, problem, rateLimited, readJson } from "@/lib/api";
import { hitShared } from "@/lib/rate-limit";
import { adminApi } from "@/lib/server/admin-gate";
import { isUuid } from "@/lib/server/db";
import { setSuspended } from "@/lib/server/platform-admin";

export const dynamic = "force-dynamic";

/** Suspend or restore an account across every workspace. Suspension signs the person out everywhere at once. */
export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  const gate = await adminApi(request, { reauth: true });
  if (gate.error) return gate.error;
  const limit = await hitShared(`admin-users:${gate.access.userId}`, 30, 10 * 60_000);
  if (!limit.allowed) return rateLimited("Too many account changes. Wait a few minutes.", limit.retryAfter);
  const { userId } = await context.params;
  const body = await readJson<{ suspended?: boolean; reason?: string }>(request);
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!isUuid(userId) || typeof body?.suspended !== "boolean") return problem(422, "invalid", "Unknown request.");
  if (body.suspended && reason.length < 5) return problem(422, "invalid", "Give a reason for the audit log.", { fields: { reason: "Give a reason (at least 5 characters)." } });
  const ok = await setSuspended(gate.access.userId, userId, body.suspended, reason);
  return ok ? json({ ok: true }) : problem(409, "conflict", "This account cannot be changed here. Administrators cannot suspend themselves or another administrator.");
}
