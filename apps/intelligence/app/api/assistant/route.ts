import { json, problem, rateLimited, readJson } from "@/lib/api";
import { aiLimits } from "@/lib/server/ai/config";
import { errorFields, userMessage } from "@/lib/server/ai/errors";
import { appendToThread, createThread, HISTORY_FOR_MODEL, lastCall, listThreads, readThread, validThreadId } from "@/lib/server/ai/history";
import { aiStatus } from "@/lib/server/ai/status";
import { clientKey, hitShared } from "@/lib/rate-limit";
import { MAX_MESSAGE_CHARS, runAssistant, toolsFor, validMessages, type ChatMessage } from "@/lib/server/assistant";
import { checkRequest, redactingEmitter } from "@/lib/server/assistant-guard";
import { getPrincipal } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/csrf";
import { tenantTx } from "@/lib/server/db";
import { readEntitlements } from "@/lib/server/entitlement-store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Whether the assistant can be used here, so the page can say so before anyone types: the selected provider and model,
 * whether its key is set, whether the provider accepted the key and model when last checked (no generation quota used),
 * and how the last real call for this dealership went. Keys are never part of this response.
 */
export async function GET() {
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Your session has expired. Sign in again.");
  const { principal } = current;
  const status = await aiStatus({ check: true });
  let recent: Awaited<ReturnType<typeof lastCall>> = null;
  let threads: Awaited<ReturnType<typeof listThreads>> = [];
  try {
    ({ recent, threads } = await tenantTx(principal.tenantId, async (c) => ({ recent: await lastCall(c, principal.tenantId), threads: await listThreads(c, principal.tenantId, principal.userId, 20) })));
  } catch (error) {
    console.error(JSON.stringify({ event: "assistant_status_failure", message: error instanceof Error ? error.name : "unknown" }));
  }
  return json({
    configured: status.configured, provider: status.provider, model: status.model, availability: status.availability, checkedAt: status.checkedAt,
    // Which setting is missing is shown to owners only (variable names, never values).
    ...(principal.role === "owner" && status.problem ? { problem: status.problem } : {}),
    lastCall: recent, threads, topics: toolsFor(principal.role),
  });
}

const NOTE = { refused: "I can't help with that request.", truncated: "\n\n(The answer was cut short. Ask me to continue.)", too_long: "\n\n(That needed more lookups than I can do in one go. Ask a narrower question.)" } as const;

/**
 * Ask a question. With `threadId`, the conversation so far is read from the member's saved thread and only the newest
 * question is taken from the request. Without one, the request's messages are used (as before) and a new thread is saved.
 * The thread id comes back in the X-Assistant-Thread header.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Your session has expired. Sign in again.");
  const { principal } = current;
  const status = await aiStatus();
  if (!status.configured) return problem(503, "not_configured", "The assistant is not set up for this workspace yet. Ask VandLabs to enable it.");
  const limit = await hitShared(`assistant:${principal.userId}:${clientKey(request)}`, aiLimits(status.provider).userRequestsPer10Min, 10 * 60_000);
  if (!limit.allowed) return rateLimited("You have asked a lot in a short time. Wait a few minutes and try again.", limit.retryAfter);
  const body = await readJson<{ messages?: unknown; page?: unknown; threadId?: unknown }>(request, 120_000);
  if (!body || !validMessages(body.messages)) return problem(422, "invalid", "Send your question as text.");
  const sent: ChatMessage[] = body.messages;
  const question = sent.at(-1)!;
  const page = typeof body.page === "string" && /^\/app\/[A-Za-z0-9/_-]{0,120}$/.test(body.page) ? body.page : "";
  // Secrets are refused here, before any model is called.
  const verdict = checkRequest(question.content);
  if (!verdict.allowed) return new Response(verdict.reply, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  let dealership = "";
  let threadId: string | null = null;
  let history: ChatMessage[] = sent;
  try {
    const gate = await tenantTx(principal.tenantId, async (c) => {
      const entitlements = await readEntitlements(c, principal.tenantId);
      if (!entitlements.features.assistant.enabled) return { entitlements, name: "", thread: null as string | null, stored: null as ChatMessage[] | null };
      const name = String((await c.query("SELECT name FROM organizations WHERE tenant_id = $1 ORDER BY created_at LIMIT 1", [principal.tenantId])).rows[0]?.name ?? "");
      // A thread id that is not this member's own is treated like no thread: a new one is started.
      const stored = validThreadId(body.threadId) ? await readThread(c, principal.tenantId, principal.userId, body.threadId, HISTORY_FOR_MODEL - 1) : null;
      return { entitlements, name, thread: stored ? (body.threadId as string) : null, stored };
    });
    if (!gate.entitlements.features.assistant.enabled) return problem(403, "not_entitled", gate.entitlements.features.assistant.reason);
    dealership = gate.name;
    threadId = gate.thread;
    if (gate.stored) {
      // The saved thread is the history; the newest question is the only thing taken from the request.
      const prior = gate.stored.filter((m) => m.content.length <= MAX_MESSAGE_CHARS * 4);
      while (prior.length && prior[0].role !== "user") prior.shift();
      history = [...prior.filter((m, i, all) => !(i === all.length - 1 && m.role === "user")), question];
    }
  } catch (error) {
    console.error(JSON.stringify({ event: "assistant_gate_failure", message: error instanceof Error ? error.message : "unknown" }));
    return problem(500, "failed", "The assistant could not start. Try again.");
  }

  // Save the question now, so it is kept even if the answer fails part-way.
  try {
    threadId = await tenantTx(principal.tenantId, async (c) => {
      if (threadId && await appendToThread(c, principal.tenantId, principal.userId, threadId, [question])) return threadId;
      const id = await createThread(c, principal.tenantId, principal.userId, question.content);
      await appendToThread(c, principal.tenantId, principal.userId, id, sent);
      return id;
    });
  } catch (error) {
    threadId = null;
    console.error(JSON.stringify({ event: "assistant_history_failure", message: error instanceof Error ? error.name : "unknown" }));
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let wrote = false;
      let shown = "";
      const send = (text: string) => { shown += text; controller.enqueue(encoder.encode(text)); };
      // Every word passes through the secret filter on its way to the screen.
      const out = redactingEmitter(send, 160);
      const emit = (text: string) => { if (text.trim() || wrote) { wrote = wrote || Boolean(text.trim()); out.write(text); } };
      try {
        const outcome = await runAssistant({ principal, dealership, messages: history, emit, page });
        out.end();
        if (outcome.status !== "done") send(NOTE[outcome.status]);
      } catch (error) {
        console.error(JSON.stringify({ event: "assistant_failure", user: principal.userId, ...errorFields(error) }));
        out.end();
        send(`${wrote ? "\n\n" : ""}${userMessage(error)}`);
      }
      // The answer as shown (already redacted) is saved to the member's thread.
      if (threadId && shown.trim()) {
        await tenantTx(principal.tenantId, (c) => appendToThread(c, principal.tenantId, principal.userId, threadId!, [{ role: "assistant", content: shown.trim() }]))
          .catch((error) => console.error(JSON.stringify({ event: "assistant_history_failure", message: error instanceof Error ? error.name : "unknown" })));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no", ...(threadId ? { "X-Assistant-Thread": threadId } : {}) } });
}
