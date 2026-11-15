import { json, problem, rateLimited, readJson } from "@/lib/api";
import { hitShared } from "@/lib/rate-limit";
import { adminApi } from "@/lib/server/admin-gate";
import { isUuid } from "@/lib/server/db";
import { appOrigin } from "@/lib/server/google-oauth";
import { assignOwner } from "@/lib/server/platform-admin";

export const dynamic = "force-dynamic";

/** Assigns (or corrects) the owner's Google account for a workspace nobody has signed in to yet. Earlier assignments stop working. */
export async function POST(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const gate = await adminApi(request, { reauth: true });
  if (gate.error) return gate.error;
  const limit = await hitShared(`owner-invite:${gate.access.userId}`, 10, 60 * 60_000);
  if (!limit.allowed) return rateLimited("Too many owner changes. Try again later.", limit.retryAfter);
  const { tenantId } = await context.params;
  const body = await readJson<{ ownerEmail?: string; ownerName?: string }>(request);
  const email = typeof body?.ownerEmail === "string" ? body.ownerEmail.trim() : "";
  const name = typeof body?.ownerName === "string" ? body.ownerName.trim() : "";
  if (!isUuid(tenantId) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || name.length < 2) return problem(422, "invalid", "Enter the owner's name and Google email.", { fields: { ownerEmail: "Enter the owner's Google email address." } });
  if (!(await assignOwner(gate.access.userId, tenantId, email, name))) return problem(409, "conflict", "The owner has already signed in to this workspace.");
  return json({ ownerEmail: email.toLowerCase(), signInUrl: `${appOrigin(request)}/login` });
}
