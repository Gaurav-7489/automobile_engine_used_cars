import { json, problem } from "@/lib/api";
import { can } from "@/lib/permissions";
import { getPrincipal } from "@/lib/server/auth";
import { readChannels } from "@/lib/server/channels";
import { listConversations, type ConversationStatus } from "@/lib/server/conversations";
import { tenantTx } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/** Customer conversations from the website, WhatsApp and Instagram, newest first. */
export async function GET(request: Request) {
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Your session has expired. Sign in again.");
  if (!can(current.principal.role, "leads.view")) return problem(403, "forbidden", "Your role cannot view customer conversations.");
  const url = new URL(request.url);
  const status = (["ai", "team", "closed", "all"] as const).find((s) => s === url.searchParams.get("status")) ?? "all";
  const leadId = url.searchParams.get("lead") ?? undefined;
  const { principal } = current;
  return json(await tenantTx(principal.tenantId, async (c) => ({
    conversations: await listConversations(c, principal.tenantId, { status: status as ConversationStatus | "all", leadId: leadId && /^L-\d{1,9}$/.test(leadId) ? leadId : undefined }),
    channels: await readChannels(c, principal.tenantId),
  })));
}
