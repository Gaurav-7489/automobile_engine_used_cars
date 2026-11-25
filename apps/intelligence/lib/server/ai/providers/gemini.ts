import { ApiError, GoogleGenAI, type Content, type GenerateContentConfig, type GenerateContentParameters, type GenerateContentResponse, type Part } from "@google/genai";
import { geminiApiVersion, geminiThinkingLevel } from "../config";
import { AiError } from "../errors";
import type { AiProvider, ProviderSession, SessionInput, StepResult, ToolCall, ToolOutcome } from "../types";

/** The part of the Google Gen AI client used here; tests pass a scripted stand-in. */
export type GeminiClient = {
  models: {
    generateContentStream(params: GenerateContentParameters): Promise<AsyncIterable<GenerateContentResponse>>;
    get(params: { model: string; config?: { abortSignal?: AbortSignal } }): Promise<unknown>;
  };
};

const REFUSAL = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY", "LANGUAGE"]);

/**
 * Seconds from Google's RetryInfo ("retryDelay": "12s") or its message ("Please retry in 43.4s"). The SDK nests the
 * provider's JSON inside its own as an escaped string, so quotes may be preceded by backslashes.
 */
const retryDelay = (text: string): number | undefined => {
  const m = /retryDelay\\*"\s*:\s*\\*"(\d+(?:\.\d+)?)s/.exec(text) ?? /retry in (\d+(?:\.\d+)?)s/i.exec(text);
  return m ? Math.ceil(Number(m[1])) : undefined;
};

/** Maps a Google Gen AI SDK error to the shared kinds. Only the status and the error class are kept, never the response text. */
export function geminiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof ApiError) {
    const status = error.status;
    const text = error.message ?? "";
    if (status === 400 && /API[_ ]KEY[_ ]INVALID|API key not valid|API key expired/i.test(text)) return new AiError("invalid_key", "Gemini rejected the API key", { status, cause: error });
    if (status === 401 || status === 403) return new AiError("invalid_key", "Gemini rejected the API key or the API is not enabled for it", { status, cause: error });
    if (status === 404) return new AiError("model_unavailable", "The configured Gemini model is not available to this key", { status, cause: error });
    if (status === 429) {
      const wait = retryDelay(text);
      // The metric name (e.g. generate_content_free_tier_requests) is the same for per-minute and per-day limits; the quota
      // id and description say which. A per-minute limit is temporary; a per-day one lasts until the quota resets.
      const daily = /PerDay|per day|daily/i.test(text) || (!/PerMinute|per minute/i.test(text) && (wait === undefined || wait > 60));
      return daily ? new AiError("quota_exhausted", "Gemini daily quota is used up", { status, retryAfter: wait, cause: error }) : new AiError("rate_limited", "Gemini rate limit", { status, retryAfter: wait, cause: error });
    }
    if (status === 503 || status === 529) return new AiError("busy", "Gemini model is overloaded", { status, cause: error });
    if (status >= 500) return new AiError("provider", "Gemini server error", { status, cause: error });
    if (status === 400) return new AiError("bad_request", "Gemini refused the request", { status, cause: error });
    return new AiError("provider", "Gemini error", { status, cause: error });
  }
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) return new AiError("timeout", "Gemini request was stopped", { cause: error });
  if (error instanceof TypeError || (error instanceof Error && /fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|socket/i.test(error.message))) return new AiError("network", "Could not reach Gemini", { cause: error });
  return new AiError("provider", "Gemini error", { cause: error });
}

/** A failed tool's result is already { error: message }; Gemini takes that as the response object as it is. */
const errorResponse = (result: unknown): Record<string, unknown> => (result && typeof result === "object" && !Array.isArray(result) ? (result as Record<string, unknown>) : { error: result });

/** Models that refused a thinking setting once; it is not sent to them again in this instance. */
const noThinking = new Set<string>();

/**
 * Gemini via the official Google Gen AI SDK (@google/genai): streaming text, function calling with the tool loop run by the
 * engine (automatic function calling is off), and the model's parts replayed as received so Gemini 3 thought signatures
 * survive multi-step tool use.
 */
export class GeminiProvider implements AiProvider {
  readonly id = "gemini" as const;
  constructor(readonly model: string, private readonly client: GeminiClient) {}

  async probe(signal: AbortSignal): Promise<void> {
    try { await this.client.models.get({ model: this.model, config: { abortSignal: signal } }); } catch (error) { throw geminiError(error); }
  }

  start(input: SessionInput): ProviderSession {
    const { client, model } = this;
    const contents: Content[] = input.history.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const config: GenerateContentConfig = {
      systemInstruction: [input.system.stable, ...input.system.context].join("\n\n"),
      maxOutputTokens: input.maxOutputTokens,
      automaticFunctionCalling: { disable: true },
      ...(input.tools.length ? { tools: [{ functionDeclarations: input.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }] } : {}),
    };
    let calls = 0;
    return {
      async step({ onText, signal }): Promise<StepResult> {
        const thinking = geminiThinkingLevel();
        const withThinking = thinking && !noThinking.has(model) ? { thinkingConfig: { thinkingLevel: thinking as never } } : {};
        const run = async (extra: Partial<GenerateContentConfig>) => {
          const parts: Part[] = [];
          let finish: string | undefined;
          let blocked: string | undefined;
          let usage: GenerateContentResponse["usageMetadata"];
          const stream = await client.models.generateContentStream({ model, contents, config: { ...config, ...extra, abortSignal: signal } });
          for await (const chunk of stream) {
            if (chunk.promptFeedback?.blockReason) blocked = String(chunk.promptFeedback.blockReason);
            const candidate = chunk.candidates?.[0];
            for (const part of candidate?.content?.parts ?? []) {
              parts.push(part);
              if (typeof part.text === "string" && part.text && !part.thought) onText?.(part.text);
            }
            if (candidate?.finishReason) finish = String(candidate.finishReason);
            if (chunk.usageMetadata) usage = chunk.usageMetadata;
          }
          return { parts, finish, blocked, usage };
        };
        let out: Awaited<ReturnType<typeof run>>;
        try {
          out = await run(withThinking);
        } catch (error) {
          const e = geminiError(error);
          // A model without thinking support rejects the setting; remember that and ask again without it.
          if (e.kind === "bad_request" && "thinkingConfig" in withThinking && /thinking/i.test(error instanceof Error ? error.message : "")) {
            noThinking.add(model);
            try { out = await run({}); } catch (again) { throw geminiError(again); }
          } else throw e;
        }
        if (out.finish === "MALFORMED_FUNCTION_CALL" || out.finish === "UNEXPECTED_TOOL_CALL") throw new AiError("provider", "Gemini produced an invalid tool call", { status: 502 });
        const found: ToolCall[] = out.parts.filter((p) => p.functionCall?.name).map((p) => ({ id: p.functionCall!.id || `call_${(calls += 1)}`, name: p.functionCall!.name!, args: (p.functionCall!.args ?? {}) as Record<string, unknown> }));
        const text = out.parts.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join("").trim();
        const stop = out.blocked || (out.finish && REFUSAL.has(out.finish)) ? "refusal" : out.finish === "MAX_TOKENS" ? "max_tokens" : found.length ? "tool_use" : "end";
        if (stop === "tool_use") {
          // Replay exactly what the model produced (including thought signatures); give generated ids to calls without one.
          let n = 0;
          contents.push({ role: "model", parts: out.parts.map((p) => {
            if (!p.functionCall?.name) return p;
            const id = found[n++].id;
            return p.functionCall.id ? p : { ...p, functionCall: { ...p.functionCall, id } };
          }) });
        }
        const u = out.usage;
        return { text, calls: found, stop, usage: { inputTokens: u?.promptTokenCount ?? 0, outputTokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0) + (u?.toolUsePromptTokenCount ?? 0) } };
      },
      addToolResults(results: ToolOutcome[]) {
        contents.push({ role: "user", parts: results.map((r) => ({ functionResponse: { id: r.call.id, name: r.call.name, response: r.isError ? errorResponse(r.result) : { result: r.result } } })) });
      },
    };
  }
}

export { ApiError as GeminiApiError };

export const createGeminiProvider = (model: string, apiKey: string, client?: GeminiClient): GeminiProvider =>
  new GeminiProvider(model, client ?? (new GoogleGenAI({ apiKey, httpOptions: { apiVersion: geminiApiVersion() } }) as unknown as GeminiClient));
