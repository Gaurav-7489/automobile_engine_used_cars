import { json, problem, rateLimited, readJson } from "@/lib/api";
import { hitShared } from "@/lib/rate-limit";
import { can } from "@/lib/permissions";
import { API_SCOPES, createApiKey, listApiKeys, revokeApiKey, type ApiScope } from "@/lib/server/api-keys";
import { getPrincipal, hasRecentReauth } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/csrf";
import { isUuid } from "@/lib/server/db";

export const dynamic = "force-dynamic";

async function owner(request: Request | null) {
  if (request && !sameOrigin(request)) return { error: problem(403, "forbidden", "Request origin is not allowed.") };
  const current = await getPrincipal();
  if (!current) return { error: problem(401, "unauthenticated", "Sign in to continue.") };
  if (!can(current.principal.role, "settings.keys")) return { error: problem(403, "forbidden", "Only an owner can manage API keys.") };
  return { principal: current.principal };
}

export async function GET() {
  const r = await owner(null);
  if (r.error) return r.error;
  return json({ keys: await listApiKeys(r.principal.tenantId) });
}

export async function POST(request: Request) {
  const r = await owner(request);
  if (r.error) return r.error;
  if (!(await hasRecentReauth(r.principal.userId))) return problem(403, "reauth_required", "Confirm your password first.");
  const limit = await hitShared(`api-keys:${r.principal.userId}`, 10, 60 * 60_000);
  if (!limit.allowed) return rateLimited("Too many key changes. Try again later.", limit.retryAfter);
  const body = await readJson<{ name?: string; scope?: string; days?: number }>(request);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const scope = API_SCOPES.find((s) => s === body?.scope);
  const days = Number(body?.days);
  const fields: Record<string, string> = {};
  if (name.length < 2 || name.length > 60) fields.name = "Name the key (2 to 60 characters) so you know where it is used.";
  if (!scope) fields.scope = "Choose what the key can read.";
  if (![30, 90, 180, 365].includes(days)) fields.days = "Choose an expiry.";
  if (Object.keys(fields).length) return problem(422, "invalid", "Fix the highlighted fields.", { fields });
  const { key, view } = await createApiKey(r.principal, name, scope as ApiScope, days);
  return json({ key, view }, { status: 201 });
}

export async function DELETE(request: Request) {
  const r = await owner(request);
  if (r.error) return r.error;
  const id = new URL(request.url).searchParams.get("id");
  if (!isUuid(id)) return problem(422, "invalid", "Unknown key.");
  return (await revokeApiKey(r.principal.tenantId, id)) ? json({ ok: true }) : problem(404, "not_found", "That key was not found or is already revoked.");
}
