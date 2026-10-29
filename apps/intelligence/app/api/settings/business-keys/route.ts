import { json, problem, rateLimited, readJson } from "@/lib/api";
import { can } from "@/lib/permissions";
import { hitShared } from "@/lib/rate-limit";
import { getPrincipal, hasRecentReauth } from "@/lib/server/auth";
import { BUSINESS_SCOPES, createBusinessKey, listBusinessKeys, revokeBusinessKey } from "@/lib/server/business-api";
import { sameOrigin } from "@/lib/server/csrf";
import { tenantTx } from "@/lib/server/db";
import { readEntitlements } from "@/lib/server/entitlement-store";
import { auditRuleChange } from "@/lib/server/automation-store";
import { CommerceError } from "@vandlabs/data/commerce-rules";
import type { ApiScope } from "@vandlabs/contracts";

export const dynamic = "force-dynamic";

async function owner(request: Request | null) {
  if (request && !sameOrigin(request)) return { error: problem(403, "forbidden", "Request origin is not allowed.") };
  const current = await getPrincipal();
  if (!current) return { error: problem(401, "unauthenticated", "Sign in to continue.") };
  if (!can(current.principal.role, "settings.keys")) return { error: problem(403, "forbidden", "Only an owner can manage API keys.") };
  return { principal: current.principal };
}

const gated = (tenantId: string) => async (c: Parameters<Parameters<typeof tenantTx>[1]>[0]) => {
  const e = await readEntitlements(c, tenantId);
  if (!e.features.api_access.enabled) throw new CommerceError(403, e.features.api_access.reason);
};
const fail = (error: unknown) => error instanceof CommerceError ? (error.status === 429 ? rateLimited(error.message, 60) : problem(error.status === 402 ? 403 : error.status, error.status === 402 ? "not_entitled" : "invalid", error.message)) : problem(500, "failed", "That did not work. Nothing was changed.");

export async function GET() {
  const r = await owner(null);
  if (r.error) return r.error;
  try { return json(await tenantTx(r.principal.tenantId, async (c) => { await gated(r.principal.tenantId)(c); return listBusinessKeys(c, r.principal.tenantId); })); } catch (e) { return fail(e); }
}

export async function POST(request: Request) {
  const r = await owner(request);
  if (r.error) return r.error;
  if (!(await hasRecentReauth(r.principal.userId))) return problem(403, "reauth_required", "Confirm your password first.");
  const limit = await hitShared(`biz-keys:${r.principal.userId}`, 10, 60 * 60_000);
  if (!limit.allowed) return rateLimited("Too many key changes. Try again later.", limit.retryAfter);
  const body = await readJson<{ name?: string; scopes?: string[]; sourceId?: string; days?: number }>(request, 4_000);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const scopes = Array.isArray(body?.scopes) ? [...new Set(body.scopes)].filter((s): s is ApiScope => (BUSINESS_SCOPES as string[]).includes(s)) : [];
  const days = Number(body?.days);
  const fields: Record<string, string> = {};
  if (name.length < 2 || name.length > 80) fields.name = "Name the key (2 to 80 characters).";
  if (!scopes.length || scopes.length !== (body?.scopes ?? []).length) fields.scopes = "Choose what the key may do.";
  if (![30, 90, 180, 365].includes(days)) fields.days = "Choose an expiry.";
  if (scopes.includes("sourcing:write") && !body?.sourceId) fields.sourceId = "Choose the approved source this key may write to.";
  if (Object.keys(fields).length) return problem(422, "invalid", "Fix the highlighted fields.", { fields });
  try {
    const made = await tenantTx(r.principal.tenantId, async (c) => {
      await gated(r.principal.tenantId)(c);
      const result = await createBusinessKey(c, r.principal.tenantId, r.principal.name, { name, scopes, sourceId: body?.sourceId, days });
      await auditRuleChange(c, r.principal.tenantId, r.principal.name, "business_key.created", result.key.id, `${name}: ${scopes.join(", ")}`);
      return result;
    });
    return json({ key: made.token, view: made.key }, { status: 201 });
  } catch (e) { return fail(e); }
}

export async function DELETE(request: Request) {
  const r = await owner(request);
  if (r.error) return r.error;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return problem(422, "invalid", "Unknown key.");
  try {
    const done = await tenantTx(r.principal.tenantId, async (c) => {
      const ok = await revokeBusinessKey(c, r.principal.tenantId, r.principal.name, id);
      if (ok) await auditRuleChange(c, r.principal.tenantId, r.principal.name, "business_key.revoked", id, "Key revoked");
      return ok;
    });
    return done ? json({ ok: true }) : problem(404, "not_found", "That key was not found or is already revoked.");
  } catch (e) { return fail(e); }
}
