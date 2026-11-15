import { json, problem, rateLimited, readJson } from "@/lib/api";
import { hitShared } from "@/lib/rate-limit";
import { adminApi } from "@/lib/server/admin-gate";
import { isUuid } from "@/lib/server/db";
import { decideAccessRequest } from "@/lib/server/access-requests";
import { appOrigin } from "@/lib/server/google-oauth";

export const dynamic = "force-dynamic";

/**
 * `{ decision: "approve" | "decline", note?, businessName?, dealershipName? }`. Approving creates the dealership with the
 * requester's Google account as owner; they then sign in with Continue with Google. Needs a fresh Google confirmation.
 */
export async function POST(request: Request, context: { params: Promise<{ requestId: string }> }) {
  const gate = await adminApi(request, { reauth: true });
  if (gate.error) return gate.error;
  const limit = await hitShared(`admin-access-decision:${gate.access.userId}`, 60, 60 * 60_000);
  if (!limit.allowed) return rateLimited("Too many decisions in the last hour.", limit.retryAfter);
  const { requestId } = await context.params;
  const body = await readJson<{ decision?: string; note?: string; businessName?: string; dealershipName?: string }>(request);
  if (!isUuid(requestId) || (body?.decision !== "approve" && body?.decision !== "decline")) return problem(422, "invalid", "Choose approve or decline.");
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  try {
    const result = await decideAccessRequest(gate.access.userId, requestId, { approve: body.decision === "approve", note: str(body.note, 300), businessName: str(body.businessName, 120), dealershipName: str(body.dealershipName, 120) });
    return json({ ok: true, tenantId: result.tenantId, signInUrl: `${appOrigin(request)}/login` });
  } catch (error) {
    const m = error instanceof Error ? error.message : "";
    if (m === "duplicate") return problem(409, "conflict", "A business with this name already exists. Change the business name and approve again.", { fields: { businessName: "Already registered." } });
    if (/not_pending/.test(m)) return problem(409, "conflict", "This request was already decided.");
    throw error;
  }
}
