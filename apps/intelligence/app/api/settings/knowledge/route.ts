import { json, problem, rateLimited, readJson } from "@/lib/api";
import { can } from "@/lib/permissions";
import { hitShared } from "@/lib/rate-limit";
import { getPrincipal } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/csrf";
import { isUuid } from "@/lib/server/db";
import { deleteEntry, knowledgeStatus, refreshKnowledge, saveEntry, validateEntry } from "@/lib/server/knowledge";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Settings → Knowledge: what the AI agents may tell customers about the dealership. Owners (settings.admin) only. */
async function admin(request: Request | null) {
  if (request && !sameOrigin(request)) return { error: problem(403, "forbidden", "Request origin is not allowed.") };
  const current = await getPrincipal();
  if (!current) return { error: problem(401, "unauthenticated", "Sign in to continue.") };
  if (!can(current.principal.role, "settings.admin")) return { error: problem(403, "forbidden", "Only an owner can change what the AI tells customers.") };
  return { principal: current.principal };
}

export async function GET() {
  const r = await admin(null);
  if (r.error) return r.error;
  try { return json(await knowledgeStatus(r.principal.tenantId)); } catch { return problem(503, "unavailable", "Knowledge could not be loaded."); }
}

export async function POST(request: Request) {
  const r = await admin(request);
  if (r.error) return r.error;
  const { tenantId, name, userId } = r.principal;
  const body = await readJson<{ action?: string; id?: string; title?: string; content?: string }>(request, 8_000);
  if (!body) return problem(400, "invalid", "Send JSON.");
  const id = body.id && isUuid(body.id) ? body.id : undefined;
  try {
    if (body.action === "refresh") {
      const limit = await hitShared(`knowledge-refresh:${tenantId}`, 6, 60 * 60_000);
      if (!limit.allowed) return rateLimited("The website was read several times in the last hour. Try again later.", limit.retryAfter);
      const result = await refreshKnowledge(tenantId);
      return json({ result, status: await knowledgeStatus(tenantId) });
    }
    const limit = await hitShared(`knowledge-edit:${userId}`, 60, 60 * 60_000);
    if (!limit.allowed) return rateLimited("Too many changes. Try again later.", limit.retryAfter);
    if (body.action === "delete") {
      if (!id || !(await deleteEntry(tenantId, id))) return problem(404, "not_found", "That note was not found.");
      return json(await knowledgeStatus(tenantId));
    }
    if (body.action === "save") {
      const { entry, fields } = validateEntry(body as Record<string, unknown>);
      if (!entry) return problem(422, "invalid", "Fix the highlighted fields.", { fields });
      if (body.id && !id) return problem(404, "not_found", "That note was not found.");
      const saved = await saveEntry(tenantId, name, entry, id);
      if (!saved) return id ? problem(404, "not_found", "That note was not found.") : problem(409, "limit", "You have reached 60 notes. Combine or remove some first.");
      return json(await knowledgeStatus(tenantId));
    }
    return problem(400, "invalid", "Unknown action.");
  } catch (error) {
    console.error(JSON.stringify({ event: "knowledge_settings_failure", message: error instanceof Error ? error.message : "unknown" }));
    return problem(500, "failed", "That did not work. Nothing was changed.");
  }
}
