import { json, problem, rateLimited, readJson } from "@/lib/api";
import { can } from "@/lib/permissions";
import { hitShared } from "@/lib/rate-limit";
import { consumeStepUp, getPrincipal } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/csrf";
import { isUuid } from "@/lib/server/db";
import { linkOwnWebsite, ownWebsites, unlinkOwnWebsite } from "@/lib/server/website-owner";

export const dynamic = "force-dynamic";

/** The signed-in owner's own workspace. Nothing in a request can choose another workspace: the tenant comes from the verified session. */
async function owner(request: Request | null) {
  if (request && !sameOrigin(request)) return { error: problem(403, "forbidden", "Request origin is not allowed.") };
  const current = await getPrincipal();
  if (!current) return { error: problem(401, "unauthenticated", "Sign in to continue.") };
  if (!can(current.principal.role, "settings.keys")) return { error: problem(403, "forbidden", "Only the workspace owner can link a website.") };
  return { principal: current.principal };
}

export async function GET() {
  const r = await owner(null);
  if (r.error) return r.error;
  return json({ websites: await ownWebsites(r.principal) });
}

/** Links the website: `{ siteUrl }` returns a key shown once. Needs a fresh Google confirmation for "workspace.websites". */
export async function POST(request: Request) {
  const r = await owner(request);
  if (r.error) return r.error;
  const limit = await hitShared(`owner-website:${r.principal.userId}`, 20, 60 * 60_000);
  if (!limit.allowed) return rateLimited("Too many website links in the last hour.", limit.retryAfter);
  if (!(await consumeStepUp(r.principal.userId, "workspace.websites"))) return problem(403, "reauth_required", "Confirm it's you with Google first.");
  const body = await readJson<{ siteUrl?: unknown }>(request);
  const result = await linkOwnWebsite(r.principal, typeof body?.siteUrl === "string" ? body.siteUrl.trim().slice(0, 300) : "");
  if (!result.ok) return problem(result.status, result.code, result.message, { fields: result.fields });
  return json({ key: result.key, keyId: result.keyId, site: result.site, expiresAt: result.expiresAt }, { status: 201 });
}

/** `{ keyId }` disconnects one of the owner's website links. */
export async function DELETE(request: Request) {
  const r = await owner(request);
  if (r.error) return r.error;
  const body = await readJson<{ keyId?: unknown }>(request);
  if (typeof body?.keyId !== "string" || !isUuid(body.keyId)) return problem(422, "invalid", "Choose a website link.");
  if (!(await consumeStepUp(r.principal.userId, "workspace.websites"))) return problem(403, "reauth_required", "Confirm it's you with Google first.");
  if (!(await unlinkOwnWebsite(r.principal, body.keyId))) return problem(404, "not_found", "That website link is not active.");
  return json({ ok: true });
}
