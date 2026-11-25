import Anthropic from "@anthropic-ai/sdk";
import { AiError } from "../errors";
import type { AiProvider, ProviderSession, SessionInput, StepResult, ToolOutcome } from "../types";

type StreamLike = { on(event: "text", listener: (delta: string) => void): unknown; finalMessage(): Promise<Anthropic.Beta.BetaMessage> };
type StreamParams = Parameters<Anthropic["beta"]["messages"]["stream"]>[0];
/** The part of the Anthropic client the assistant uses; tests pass a scripted stand-in. */
export type AnthropicClient = {
  beta: { messages: { stream(params: StreamParams, options?: { signal?: AbortSignal }): StreamLike } };
  models?: { retrieve(model: string, params?: null, options?: { signal?: AbortSignal }): Promise<unknown> };
};

/** Maps an Anthropic SDK error to the shared kinds. */
export function anthropicError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new AiError("timeout", "Anthropic request timed out", { cause: error });
  if (error instanceof Anthropic.APIUserAbortError) return new AiError("timeout", "Anthropic request was stopped", { cause: error });
  if (error instanceof Anthropic.APIConnectionError) return new AiError("network", "Could not reach Anthropic", { cause: error });
  if (error instanceof Anthropic.APIError) {
    const status = error.status ?? 0;
    const retryAfter = Number(error.headers?.get?.("retry-after")) || undefined;
    if (status === 401 || status === 403) return new AiError("invalid_key", "Anthropic rejected the API key", { status, cause: error });
    if (status === 404) return new AiError("model_unavailable", "The configured Claude model is not available", { status, cause: error });
    if (status === 429) return new AiError("rate_limited", "Anthropic rate limit", { status, retryAfter, cause: error });
    if (status === 529 || status === 503) return new AiError("busy", "Anthropic is overloaded", { status, retryAfter, cause: error });
    if (status === 400) return /credit|billing/i.test(error.message) ? new AiError("quota_exhausted", "Anthropic account has no credit", { status, cause: error }) : new AiError("bad_request", "Anthropic refused the request", { status, cause: error });
    return new AiError("provider", "Anthropic error", { status, cause: error });
  }
  if (error instanceof Error && error.name === "AbortError") return new AiError("timeout", "Anthropic request was stopped", { cause: error });
  return new AiError("provider", "Anthropic error", { cause: error });
}

/**
 * Claude via the Anthropic SDK. This keeps everything the assistant did before: prompt caching of the stable instructions,
 * strict tool schemas, and Anthropic's server-side fallback between Claude models (within Anthropic; never another provider).
 */
export class AnthropicProvider implements AiProvider {
  readonly id = "anthropic" as const;
  constructor(readonly model: string, private readonly client: AnthropicClient) {}

  async probe(signal: AbortSignal): Promise<void> {
    try { await this.client.models?.retrieve(this.model, null, { signal }); } catch (error) { throw anthropicError(error); }
  }

  start(input: SessionInput): ProviderSession {
    const { client, model } = this;
    const messages: Anthropic.Beta.BetaMessageParam[] = input.history.map((m) => ({ role: m.role, content: m.content }));
    const system: Anthropic.Beta.BetaTextBlockParam[] = [
      { type: "text", text: input.system.stable, cache_control: { type: "ephemeral" } },
      ...input.system.context.map((text) => ({ type: "text" as const, text })),
    ];
    const tools: Anthropic.Beta.BetaTool[] = input.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Beta.BetaTool["input_schema"], strict: true }));
    return {
      async step({ onText, signal }): Promise<StepResult> {
        let message: Anthropic.Beta.BetaMessage;
        try {
          const stream = client.beta.messages.stream({
            model, max_tokens: input.maxOutputTokens, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
            ...(input.effort ? { output_config: { effort: input.effort } } : {}),
            system, tools, messages,
          }, { signal });
          if (onText) stream.on("text", onText);
          message = await stream.finalMessage();
        } catch (error) { throw anthropicError(error); }
        const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, args: (b.input ?? {}) as Record<string, unknown> }));
        const text = message.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
        const stop = message.stop_reason === "refusal" ? "refusal" : message.stop_reason === "max_tokens" ? "max_tokens" : message.stop_reason === "tool_use" && calls.length ? "tool_use" : "end";
        if (stop === "tool_use") messages.push({ role: "assistant", content: message.content });
        const usage = message.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | undefined;
        return { text, calls, stop, usage: { inputTokens: (usage?.input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0), outputTokens: usage?.output_tokens ?? 0 } };
      },
      addToolResults(results: ToolOutcome[]) {
        messages.push({ role: "user", content: results.map((r) => ({ type: "tool_result" as const, tool_use_id: r.call.id, content: JSON.stringify(r.result), ...(r.isError ? { is_error: true } : {}) })) });
      },
    };
  }
}

export const createAnthropicProvider = (model: string, apiKey: string, client?: AnthropicClient): AnthropicProvider => new AnthropicProvider(model, client ?? new Anthropic({ apiKey, maxRetries: 0 }));
