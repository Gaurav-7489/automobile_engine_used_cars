import { after } from "next/server";
import { sendOnChannel, tenantForChannel } from "@/lib/server/channels";
import { contactKey } from "@/lib/server/conversations";
import { handleCustomerMessage } from "@/lib/server/customer-ai";
import { appOrigin } from "@/lib/server/google-oauth";
import { parseDelivery, validSignature } from "@/lib/server/meta-webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Incoming WhatsApp (Cloud API) and Instagram messages. Meta signs every delivery with the app secret; unsigned or wrongly
 * signed requests are ignored. Each message is routed to the dealership that configured the receiving number or account, and
 * answered after Meta has its 200, because Meta retries slow deliveries.
 */
export function GET(request: Request) {
  const url = new URL(request.url);
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
  if (expected && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === expected) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 200_000 || !validSignature(raw, request.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET?.trim())) return new Response("Forbidden", { status: 403 });
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw) as Record<string, unknown>; } catch { return new Response("Bad request", { status: 400 }); }
  const origin = appOrigin(request);
  const messages = parseDelivery(body).slice(0, 20);
  after(async () => {
    for (const m of messages) {
      try {
        const tenant = await tenantForChannel(m.channel, m.account);
        if (!tenant) continue;
        const handled = await handleCustomerMessage({ tenantId: tenant, channel: m.channel, key: contactKey(m.channel, m.from), ref: m.from, text: m.text, name: m.name || undefined, phone: m.channel === "whatsapp" ? `+${m.from}` : undefined, origin });
        if (handled.reply) await sendOnChannel(tenant, m.channel, m.from, handled.reply.text);
      } catch (error) {
        console.error(JSON.stringify({ event: "meta_webhook_failure", channel: m.channel, message: error instanceof Error ? error.message : "unknown" }));
      }
    }
  });
  return new Response("EVENT_RECEIVED", { status: 200 });
}
