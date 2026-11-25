import { hitShared } from "../../rate-limit";
import { aiConfig, aiLimits, providerKey, type AiLimits } from "./config";
import { AiError, errorFields, retryable } from "./errors";
import { createAnthropicProvider, type AnthropicClient } from "./providers/anthropic";
import { createGeminiProvider, type GeminiClient } from "./providers/gemini";
import type { AiProvider, SessionInput, StepResult, ToolCall, ToolSpec, Usage } from "./types";
import { assertBudget, recordUsage } from "./usage";

export type { ToolSpec, TextMessage, SystemPrompt } from "./types";

/**
 * The provider-independent AI engine. Every AI feature (the staff assistant and the customer agent) goes through here, so
 * the same rules hold whichever provider answers:
 *  - the provider and model come from the environment (see config.ts); there is no automatic switch to another provider;
 *  - daily budgets per dealership and per project are checked before each model call, and a shared per-minute limit keeps
 *    calls under the provider's requests-per-minute quota (waiting briefly for the next minute when that is short);
 *  - at most N model calls run at once in this instance; the rest wait briefly, then are told the AI is busy;
 *  - each call has a timeout, and temporary failures are retried a few times, only before any text has been shown;
 *  - every call is recorded in the usage ledger with its tokens and outcome (never its content).
 * Tools run in the caller (which applies the tenant, branch and role checks); the engine only passes calls and results.
 */

/** Builds the provider selected by the environment. Throws AiError("not_configured") when it is not set up. */
export function providerFromEnv(): AiProvider {
  const cfg = aiConfig();
  if (!cfg.configured) throw new AiError("not_configured", cfg.problem ?? "AI is not configured");
  return cfg.provider === "gemini" ? createGeminiProvider(cfg.model, providerKey("gemini")) : createAnthropicProvider(cfg.model, providerKey("anthropic"));
}

/** For tests and scripts: a provider built around a given SDK client (no key needed). */
export const providerWithClient = {
  anthropic: (client: AnthropicClient, model = aiConfig().provider === "anthropic" ? aiConfig().model : "claude-opus-5-5") => createAnthropicProvider(model, "", client),
  gemini: (client: GeminiClient, model = "gemini-flash-latest") => createGeminiProvider(model, "", client),
};

// Concurrency: a small in-process semaphore. On serverless each instance has its own; the shared per-member rate limit and
// the daily budgets in the database bound the total. (Scaling note: a shared limiter can replace this without API changes.)
let running = 0;
const waiting: (() => void)[] = [];
async function acquire(limits: AiLimits): Promise<() => void> {
  if (running >= limits.maxConcurrency) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { const i = waiting.indexOf(go); if (i >= 0) waiting.splice(i, 1); reject(new AiError("busy", "Too many AI requests are running")); }, limits.queueWaitMs);
      const go = () => { clearTimeout(timer); resolve(); };
      waiting.push(go);
    });
  }
  running += 1;
  let released = false;
  return () => { if (released) return; released = true; running -= 1; waiting.shift()?.(); };
}
export const aiLoad = (): { running: number; waiting: number } => ({ running, waiting: waiting.length });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ToolRunner = (call: ToolCall) => Promise<{ ok: true; result: unknown } | { ok: false; message: string }>;

export type ConversationInput = Omit<SessionInput, "maxOutputTokens"> & {
  feature: "assistant" | "customer";
  tenantId: string;
  userId: string | null;
  maxTurns: number;
  maxOutputTokens?: number;
  runTool: ToolRunner;
  onText?: (text: string) => void;
  /** Called between a tool round and the next model call (the assistant writes a paragraph break there). */
  onToolRound?: () => void;
  provider?: AiProvider;
};

export type ConversationResult = { status: "done" | "refused" | "truncated" | "too_long"; turns: number; text: string; usage: Usage; provider: string; model: string };

/** Runs the model, executes any tools it asks for, and repeats until it answers (or a limit is reached). */
export async function runConversation(input: ConversationInput): Promise<ConversationResult> {
  const provider = input.provider ?? providerFromEnv();
  const limits = aiLimits(provider.id);
  const session = provider.start({
    system: input.system, tools: input.tools, history: input.history, effort: input.effort,
    maxOutputTokens: input.maxOutputTokens ?? (input.feature === "customer" ? limits.customerMaxOutputTokens : limits.assistantMaxOutputTokens),
  });
  const total: Usage = { inputTokens: 0, outputTokens: 0 };
  const base = { provider: provider.id, model: provider.model };
  for (let turn = 1; turn <= input.maxTurns; turn += 1) {
    const step = await callOnce(provider.id, provider.model, input, limits, (opts) => session.step(opts));
    total.inputTokens += step.usage.inputTokens;
    total.outputTokens += step.usage.outputTokens;
    if (step.stop === "refusal") return { status: "refused", turns: turn, text: "", usage: total, ...base };
    if (step.stop === "max_tokens") return { status: "truncated", turns: turn, text: step.text, usage: total, ...base };
    if (step.stop !== "tool_use") return { status: "done", turns: turn, text: step.text, usage: total, ...base };
    const results = await Promise.all(step.calls.map(async (call) => {
      const out = await input.runTool(call);
      return { call, result: out.ok ? out.result : { error: out.message }, isError: !out.ok };
    }));
    session.addToolResults(results);
    input.onToolRound?.();
  }
  return { status: "too_long", turns: input.maxTurns, text: "", usage: total, ...base };
}

/**
 * The provider's per-minute quota is per project and model, so the limit is shared across instances (database-backed).
 * When the minute is full, wait for the next one if that is within the queue wait; otherwise report "busy" without spending
 * a request (failed requests count against the provider's quota too).
 */
async function underMinuteLimit(provider: string, model: string, limits: AiLimits): Promise<void> {
  if (!limits.callsPerMinute) return;
  const deadline = Date.now() + limits.queueWaitMs;
  for (;;) {
    const hit = await hitShared(`ai-minute:${provider}:${model}`, limits.callsPerMinute, 60_000);
    if (hit.allowed) return;
    const waitMs = hit.retryAfter * 1000;
    if (Date.now() + waitMs > deadline) throw new AiError("rate_limited", "Per-minute AI call limit reached", { retryAfter: hit.retryAfter });
    await sleep(waitMs);
  }
}

/** One model call with budget, concurrency, timeout, retries and usage recording. */
async function callOnce(provider: AiProvider["id"], model: string, input: ConversationInput, limits: AiLimits, step: (opts: { onText?: (t: string) => void; signal: AbortSignal }) => Promise<StepResult>): Promise<StepResult> {
  for (let attempt = 0; ; attempt += 1) {
    await assertBudget(input.tenantId, provider);
    await underMinuteLimit(provider, model, limits);
    const release = await acquire(limits);
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limits.timeoutMs);
    let shown = false;
    let backoff = 0;
    try {
      const result = await step({ signal: controller.signal, onText: input.onText ? (t) => { if (t) shown = true; input.onText!(t); } : undefined });
      await recordUsage({ tenantId: input.tenantId, userId: input.userId, feature: input.feature, provider, model, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, status: "ok", latencyMs: Date.now() - started });
      return result;
    } catch (raw) {
      const error = raw instanceof AiError ? raw : new AiError(controller.signal.aborted ? "timeout" : "provider", "AI call failed", { cause: raw });
      const final = controller.signal.aborted && error.kind !== "timeout" ? new AiError("timeout", "AI call timed out", { cause: raw }) : error;
      await recordUsage({ tenantId: input.tenantId, userId: input.userId, feature: input.feature, provider, model, inputTokens: 0, outputTokens: 0, status: "error", errorKind: final.kind, latencyMs: Date.now() - started });
      const waitMs = final.retryAfter ? final.retryAfter * 1000 : 600 * 2 ** attempt + Math.floor(Math.random() * 300);
      const again = !shown && attempt < limits.maxRetries && retryable(final) && waitMs <= limits.maxRetryDelayMs;
      console.error(JSON.stringify({ event: "ai_call_failure", feature: input.feature, provider, model, attempt, retrying: again, ...errorFields(final) }));
      if (!again) throw final;
      backoff = waitMs;
    } finally {
      clearTimeout(timer);
      release();
    }
    // The slot is released while waiting, so a retry never blocks someone else's question.
    await sleep(backoff);
  }
}
