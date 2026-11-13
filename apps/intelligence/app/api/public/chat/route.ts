import { json, problem, rateLimited } from "@/lib/api";
import { clientKey, hitShared } from "@/lib/rate-limit";
import { websiteChatEnabled } from "@/lib/server/channels";
import { contactKey, findConversation, type ConvMessage } from "@/lib/server/conversations";
import { sameOrigin } from "@/lib/server/csrf";
import { tenantTx } from "@/lib/server/db";
import { appOrigin } from "@/lib/server/google-oauth";
import { handleCustomerMessage } from "@/lib/server/customer-ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The chat on a dealership's public car pages. The visitor holds a random token in their own browser; only its hash is stored,
 * and only someone holding it can read or continue that conversation. Off unless the dealership switched website chat on.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VISITOR = /^[A-Za-z0-9_-]{24,64}$/;
const STOCK = /^[A-Za-z0-9-]{1,40}$/;

const publicView = (messages: ConvMessage[]) => messages.map((m) => ({ id: m.id, at: m.at, from: m.from, text: m.text }));

async function current(tenant: string, visitor: string) {
  const key = contactKey("website", visitor);
  return tenantTx(tenant, async (c) => {
    const row = (await c.query("SELECT conversation_id FROM intelligence_conversations WHERE tenant_id = $1 AND channel = 'website' AND contact_key = $2 ORDER BY updated_at DESC LIMIT 1", [tenant, key])).rows[0] as { conversation_id: string } | undefined;
    return row ? findConversation(c, tenant, row.conversation_id) : null;
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tenant = (url.searchParams.get("tenant") ?? "").toLowerCase();
  const visitor = url.searchParams.get("visitor") ?? "";
  if (!UUID.test(tenant) || !VISITOR.test(visitor)) return problem(422, "invalid", "Missing chat details.");
  if (!(await websiteChatEnabled(tenant))) return json({ enabled: false, messages: [] });
  const conv = await current(tenant, visitor).catch(() => null);
  return json({ enabled: true, status: conv?.status ?? "ai", messages: publicView(conv?.messages ?? []) });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const text = await request.text();
  if (text.length > 4000) return problem(413, "too_large", "That message is too long.");
  let body: Record<string, unknown>;
  try { body = JSON.parse(text) as Record<string, unknown>; } catch { return problem(422, "invalid", "Send valid JSON."); }
  const tenant = String(body.tenant ?? "").toLowerCase();
  const visitor = String(body.visitor ?? "");
  const message = typeof body.text === "string" ? body.text.trim() : "";
  const stock = typeof body.stock === "string" && STOCK.test(body.stock) ? body.stock : null;
  if (!UUID.test(tenant) || !VISITOR.test(visitor) || !message || message.length > 1000) return problem(422, "invalid", "Type a message of up to 1,000 characters.");
  const perVisitor = await hitShared(`chat:${clientKey(request)}`, 20, 10 * 60_000);
  if (!perVisitor.allowed) return rateLimited("You've sent a lot of messages. Please wait a few minutes or call the dealership.", perVisitor.retryAfter);
  const perDealer = await hitShared(`chat-tenant:${tenant}`, 400, 60 * 60_000);
  if (!perDealer.allowed) return rateLimited("The dealership is very busy right now. Please call them directly.", perDealer.retryAfter);
  if (!(await websiteChatEnabled(tenant))) return problem(404, "not_found", "Chat is not available for this dealership.");
  try {
    const handled = await handleCustomerMessage({ tenantId: tenant, channel: "website", key: contactKey("website", visitor), text: message, stock, origin: appOrigin(request) });
    const conv = await current(tenant, visitor);
    return json({ status: conv?.status ?? handled.conversation.status, messages: publicView(conv?.messages ?? []) });
  } catch (error) {
    console.error(JSON.stringify({ event: "website_chat_failure", message: error instanceof Error ? error.message : "unknown" }));
    return problem(503, "unavailable", "The chat is not available right now. Please call the dealership.");
  }
}
