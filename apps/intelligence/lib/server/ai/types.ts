import type { ProviderId } from "./config";

/** A tool the model may call, described once for every provider (JSON Schema for the arguments). */
export type ToolSpec = { name: string; description: string; parameters: Record<string, unknown> };

/** Plain conversation history: what people typed and what they were shown. */
export type TextMessage = { role: "user" | "assistant"; content: string };

export type ToolCall = { id: string; name: string; args: Record<string, unknown> };
export type ToolOutcome = { call: ToolCall; result: unknown; isError: boolean };

export type StopReason = "end" | "tool_use" | "max_tokens" | "refusal";
export type Usage = { inputTokens: number; outputTokens: number };
export type StepResult = { text: string; calls: ToolCall[]; stop: StopReason; usage: Usage };

/**
 * The system prompt in two parts: `stable` is identical for every request (so providers can cache it), `context` changes
 * per request (who is asking, the page, retrieved guide excerpts).
 */
export type SystemPrompt = { stable: string; context: string[] };

export type SessionInput = {
  system: SystemPrompt;
  tools: ToolSpec[];
  history: TextMessage[];
  maxOutputTokens: number;
  /** Optional effort hint; providers that do not support it ignore it. */
  effort?: "low" | "medium" | "high";
};

/**
 * One conversation with a provider. The session keeps the provider's own transcript (Claude content blocks, Gemini parts
 * with their thought signatures) so multi-step tool use replays exactly what the model produced.
 */
export interface ProviderSession {
  /** Runs one model call. Text is passed to `onText` as it streams. Throws AiError on failure. */
  step(options: { onText?: (text: string) => void; signal: AbortSignal }): Promise<StepResult>;
  /** Adds the results of the tool calls from the last step, ready for the next one. */
  addToolResults(results: ToolOutcome[]): void;
}

export interface AiProvider {
  readonly id: ProviderId;
  readonly model: string;
  start(input: SessionInput): ProviderSession;
  /** Cheap check that the key works and the model exists (no generation, no quota used). */
  probe(signal: AbortSignal): Promise<void>;
}
