import Anthropic from "@anthropic-ai/sdk";
import { json, problem, rateLimited, readJson } from "@/lib/api";
import { clientKey, hitShared } from "@/lib/rate-limit";
import { assistantConfigured, runAssistant, toolsFor, validMessages } from "@/lib/server/assistant";
import { checkRequest, redactingEmitter } from "@/lib/server/assistant-guard";
import { getPrincipal } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/csrf";
import { tenantTx } from "@/lib/server/db";
import { readEntitlements } from "@/lib/server/entitlement-store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Whether the assistant can be used here, so the page can say so before anyone types. */
export async function GET() {
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Your session has expired. Sign in again.");
  return json({ configured: assistantConfigured(), topics: toolsFor(current.principal.role) });
}

const NOTE = { refused: "I can't help with that request.", truncated: "\n\n(The answer was cut short. Ask me to continue.)", too_long: "\n\n(That needed more lookups than I can do in one go. Ask a narrower question.)" } as const;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Your session has expired. Sign in again.");
  const { principal } = current;
  if (!assistantConfigured()) return problem(503, "not_configured", "The assistant is not set up for this workspace yet. Ask VandLabs to enable it.");
  const limit = await hitShared(`assistant:${principal.userId}:${clientKey(request)}`, 30, 10 * 60_000);
  if (!limit.allowed) return rateLimited("You have asked a lot in a short time. Wait a few minutes and try again.", limit.retryAfter);
  const body = await readJson<{ messages?: unknown; page?: unknown }>(request, 120_000);
  if (!body || !validMessages(body.messages)) return problem(422, "invalid", "Send your question as text.");
  const messages = body.messages;
  const page = typeof body.page === "string" && /^\/app\/[A-Za-z0-9/_-]{0,120}$/.test(body.page) ? body.page : "";
  // Secrets are refused here, before any model is called.
  const verdict = checkRequest(messages.at(-1)!.content);
  if (!verdict.allowed) return new Response(verdict.reply, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  let dealership = "";
  try {
    const gate = await tenantTx(principal.tenantId, async (c) => ({
      entitlements: await readEntitlements(c, principal.tenantId),
      name: String((await c.query("SELECT name FROM organizations WHERE tenant_id = $1 ORDER BY created_at LIMIT 1", [principal.tenantId])).rows[0]?.name ?? ""),
    }));
    if (!gate.entitlements.features.assistant.enabled) return problem(403, "not_entitled", gate.entitlements.features.assistant.reason);
    dealership = gate.name;
  } catch (error) {
    console.error(JSON.stringify({ event: "assistant_gate_failure", message: error instanceof Error ? error.message : "unknown" }));
    return problem(500, "failed", "The assistant could not start. Try again.");
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let wrote = false;
      // Every word passes through the secret filter on its way to the screen.
      const out = redactingEmitter((text) => controller.enqueue(encoder.encode(text)), 160);
      const emit = (text: string) => { if (text.trim() || wrote) { wrote = wrote || Boolean(text.trim()); out.write(text); } };
      try {
        const outcome = await runAssistant({ principal, dealership, messages, emit, page });
        out.end();
        if (outcome.status !== "done") controller.enqueue(encoder.encode(NOTE[outcome.status]));
      } catch (error) {
        const busy = error instanceof Anthropic.RateLimitError || (error instanceof Anthropic.APIError && (error.status ?? 0) >= 500);
        console.error(JSON.stringify({ event: "assistant_failure", user: principal.userId, status: error instanceof Anthropic.APIError ? error.status : undefined, message: error instanceof Error ? error.name : "unknown" }));
        out.end();
        controller.enqueue(encoder.encode(`${wrote ? "\n\n" : ""}${busy ? "The assistant is busy right now. Try again in a moment." : "The assistant could not answer that. Try again."}`));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
