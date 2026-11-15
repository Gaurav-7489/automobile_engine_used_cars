import { json, problem, rateLimited, readJson } from "@/lib/api";
import { hitShared } from "@/lib/rate-limit";
import { adminApi } from "@/lib/server/admin-gate";
import { isUuid } from "@/lib/server/db";
import { linkWebsite, unlinkWebsite, websiteKeys } from "@/lib/server/platform-admin";
import { siteHost, siteOrigin } from "@/lib/server/website-connect";

export const dynamic = "force-dynamic";

/** The dealership websites linked to a workspace. Keys are listed by prefix only. */
export async function GET(_request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const gate = await adminApi(null);
  if (gate.error) return gate.error;
  const { tenantId } = await context.params;
  if (!isUuid(tenantId)) return problem(404, "not_found", "Not found.");
  return json({ websites: await websiteKeys(gate.access.userId, tenantId) });
}

/**
 * Links a website: `{ siteUrl }` → a website key shown once. Set it on the website's deployment as VANDLABS_API_KEY (with
 * VANDLABS_API_URL). It reads published stock and records enquiries and visit counts for this workspace only; nothing else.
 */
export async function POST(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const gate = await adminApi(request, { reauth: true });
  if (gate.error) return gate.error;
  const limit = await hitShared(`admin-website:${gate.access.userId}`, 20, 60 * 60_000);
  if (!limit.allowed) return rateLimited("Too many website links in the last hour.", limit.retryAfter);
  const { tenantId } = await context.params;
  const body = await readJson<{ siteUrl?: string }>(request);
  const url = typeof body?.siteUrl === "string" ? body.siteUrl.trim() : "";
  const host = siteHost(url);
  if (!isUuid(tenantId) || !host) return problem(422, "invalid", "Enter the website's address, for example https://www.dealer.example.", { fields: { siteUrl: "Enter the full website address." } });
  try {
    const issued = await linkWebsite(gate.access.userId, tenantId, { host, origin: siteOrigin(url) });
    return json({ key: issued.key, keyId: issued.id, site: host, expiresAt: issued.expiresAt, webhooks: siteOrigin(url) !== null }, { status: 201 });
  } catch (error) {
    if (/unknown_workspace/.test(String((error as Error).message))) return problem(404, "not_found", "Not found.");
    throw error;
  }
}

/** `{ keyId }` unlinks: the website stops reading stock and sending enquiries at once. */
export async function DELETE(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const gate = await adminApi(request, { reauth: true });
  if (gate.error) return gate.error;
  const { tenantId } = await context.params;
  const body = await readJson<{ keyId?: string }>(request);
  if (!isUuid(tenantId) || typeof body?.keyId !== "string" || !isUuid(body.keyId)) return problem(422, "invalid", "Choose a website link.");
  if (!(await unlinkWebsite(gate.access.userId, tenantId, body.keyId))) return problem(404, "not_found", "That website link is not active.");
  return json({ ok: true });
}
