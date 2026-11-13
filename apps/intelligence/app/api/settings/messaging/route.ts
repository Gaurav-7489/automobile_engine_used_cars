import { json, problem, readJson } from "@/lib/api";
import { can } from "@/lib/permissions";
import { assistantConfigured } from "@/lib/server/assistant";
import { getPrincipal, hasRecentReauth } from "@/lib/server/auth";
import { canManageChannels, readChannels, saveChannel } from "@/lib/server/channels";
import { sameOrigin } from "@/lib/server/csrf";
import { tenantTx } from "@/lib/server/db";
import { appOrigin } from "@/lib/server/google-oauth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Sign in to continue.");
  if (!can(current.principal.role, "settings.view")) return problem(403, "forbidden", "Your role cannot view settings.");
  const { principal } = current;
  return json({
    channels: await tenantTx(principal.tenantId, (c) => readChannels(c, principal.tenantId)),
    aiReady: assistantConfigured(), metaReady: Boolean(process.env.META_APP_SECRET?.trim() && process.env.META_WEBHOOK_VERIFY_TOKEN?.trim()),
    webhookUrl: `${appOrigin(request)}/api/webhooks/meta`, canManage: canManageChannels(principal),
  });
}

/** Switch a channel on or off, or save WhatsApp / Instagram account details. Tokens need a recent password confirmation. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Sign in to continue.");
  const body = await readJson<{ channel?: unknown; enabled?: unknown; externalId?: unknown; token?: unknown }>(request, 8000);
  const channel = body?.channel;
  if (channel !== "website" && channel !== "whatsapp" && channel !== "instagram") return problem(422, "invalid", "Choose a channel.");
  const token = typeof body?.token === "string" ? body.token.slice(0, 1000) : undefined;
  if (token && !(await hasRecentReauth(current.principal.userId))) return problem(403, "reauth_required", "Confirm your password before saving an access token.");
  const result = await saveChannel(current.principal, { channel, enabled: body?.enabled === true, externalId: typeof body?.externalId === "string" ? body.externalId.slice(0, 40) : undefined, token });
  return result.ok ? json(result) : problem(422, "invalid", result.message);
}
