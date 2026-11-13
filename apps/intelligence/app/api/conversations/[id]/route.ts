import { json, problem, readJson } from "@/lib/api";
import { can } from "@/lib/permissions";
import { getPrincipal } from "@/lib/server/auth";
import { sendOnChannel } from "@/lib/server/channels";
import { appendMessages, cleanText, findConversation } from "@/lib/server/conversations";
import { leadForConversation } from "@/lib/server/customer-ai";
import { sameOrigin } from "@/lib/server/csrf";
import { tenantTx } from "@/lib/server/db";
import { enterLive } from "@/lib/server/workspace";

export const dynamic = "force-dynamic";

/**
 * The team's side of a conversation: reply (sent on the customer's channel), take it over from the AI, hand it back, close it,
 * or turn it into a lead. Replying needs a role that may contact customers.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Sign in to continue.");
  const { principal } = current;
  if (!can(principal.role, "leads.contact")) return problem(403, "forbidden", "Your role cannot reply to customers.");
  const { id } = await params;
  if (!/^C-[0-9A-F]{8}$/.test(id)) return problem(404, "not_found", "Conversation not found.");
  const body = await readJson<{ action?: unknown; text?: unknown }>(request, 8000);
  const action = body?.action;
  enterLive();
  const conv = await tenantTx(principal.tenantId, (c) => findConversation(c, principal.tenantId, id));
  if (!conv) return problem(404, "not_found", "Conversation not found.");
  if (action === "reply") {
    const text = cleanText(body?.text, 1000);
    if (!text) return problem(422, "invalid", "Type a reply.");
    const to = conv.channel === "website" ? "" : conv.contactRef;
    const sent = await sendOnChannel(principal.tenantId, conv.channel, to, text);
    if (!sent) return problem(502, "not_sent", "The reply could not be delivered. Check the channel in Settings → Customer messaging.");
    await tenantTx(principal.tenantId, (c) => appendMessages(c, principal.tenantId, id, [{ from: "team", text, by: principal.name }], { status: "team", unread: false }));
  } else if (action === "take" || action === "return" || action === "close" || action === "read") {
    const patch = action === "take" ? { status: "team" as const, unread: false } : action === "return" ? { status: "ai" as const } : action === "close" ? { status: "closed" as const, unread: false } : { unread: false };
    await tenantTx(principal.tenantId, (c) => appendMessages(c, principal.tenantId, id, [], patch));
  } else if (action === "lead") {
    if (!can(principal.role, "leads.edit")) return problem(403, "forbidden", "Your role cannot add leads.");
    const leadId = await tenantTx(principal.tenantId, async (c) => {
      const made = await leadForConversation(c, principal.tenantId, conv, { name: conv.contactName, phone: conv.contactPhone, reason: "Added by the team from the conversation" });
      if (made) await appendMessages(c, principal.tenantId, id, [], { leadId: made });
      return made;
    });
    if (!leadId) return problem(422, "invalid", "A lead could not be created. Add the customer's name or number first.");
  } else return problem(422, "invalid", "Unknown action.");
  return json({ conversation: await tenantTx(principal.tenantId, (c) => findConversation(c, principal.tenantId, id)) });
}
