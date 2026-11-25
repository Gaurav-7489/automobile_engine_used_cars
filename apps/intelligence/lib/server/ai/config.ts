/**
 * Which AI provider answers, and the limits around it. Everything comes from environment variables, so switching between
 * Gemini and Claude is a configuration change, never a code change.
 *
 * - AI_PROVIDER: "gemini" or "anthropic". When unset, Anthropic is used (the original behaviour), so existing deployments
 *   keep working unchanged. There is never an automatic switch to another provider: if the selected one is not configured,
 *   or fails, the AI features report that instead of quietly calling a different (possibly paid) service.
 * - Keys are read here on the server only. They are never returned by any route, logged, or sent to the browser.
 */
export type ProviderId = "anthropic" | "gemini";

export type AiConfig = {
  provider: ProviderId;
  /** The model for this provider, as configured (an alias such as gemini-flash-latest is allowed). */
  model: string;
  /** True when the selected provider has a key. Says nothing about whether the key or model actually work. */
  configured: boolean;
  /** Why it is not configured, in words an operator can act on. Never contains a key. */
  problem: string | null;
};

const env = (name: string): string => process.env[name]?.trim() ?? "";
const int = (name: string, fallback: number, min: number, max: number): number => {
  const n = Number.parseInt(env(name), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function selectedProvider(): ProviderId | "invalid" {
  const raw = env("AI_PROVIDER").toLowerCase();
  if (!raw) return "anthropic";
  if (raw === "gemini" || raw === "google") return "gemini";
  if (raw === "anthropic" || raw === "claude") return "anthropic";
  return "invalid";
}

export const DEFAULT_MODELS: Record<ProviderId, string> = { anthropic: "claude-opus-5-5", gemini: "gemini-flash-latest" };

export function aiConfig(): AiConfig {
  const provider = selectedProvider();
  if (provider === "invalid") return { provider: "anthropic", model: "", configured: false, problem: "AI_PROVIDER must be \"gemini\" or \"anthropic\"." };
  if (provider === "gemini") {
    const model = env("GEMINI_MODEL") || DEFAULT_MODELS.gemini;
    return env("GEMINI_API_KEY") ? { provider, model, configured: true, problem: null } : { provider, model, configured: false, problem: "GEMINI_API_KEY is not set." };
  }
  // ASSISTANT_MODEL is the original variable for the Claude model; ANTHROPIC_MODEL is accepted as a clearer name.
  const model = env("ANTHROPIC_MODEL") || env("ASSISTANT_MODEL") || DEFAULT_MODELS.anthropic;
  return env("ANTHROPIC_API_KEY") ? { provider, model, configured: true, problem: null } : { provider, model, configured: false, problem: "ANTHROPIC_API_KEY is not set." };
}

/** The selected provider's key. Server-only; callers pass it straight to the SDK. */
export function providerKey(provider: ProviderId): string {
  return provider === "gemini" ? env("GEMINI_API_KEY") : env("ANTHROPIC_API_KEY");
}

/** Gemini API version. SDK 3.x defaults to v1, where the "-latest" aliases do not exist, so v1beta is the default here. */
export const geminiApiVersion = (): string => env("GEMINI_API_VERSION") || "v1beta";

/** Thinking effort for Gemini models that support it. Low keeps free-tier token use and latency down. "off" sends nothing. */
export function geminiThinkingLevel(): "MINIMAL" | "LOW" | "MEDIUM" | "HIGH" | null {
  const v = (env("GEMINI_THINKING_LEVEL") || "low").toUpperCase();
  return v === "OFF" || v === "NONE" ? null : v === "MINIMAL" || v === "MEDIUM" || v === "HIGH" ? v : "LOW";
}

export type AiLimits = {
  /** Wall-clock limit for one model call, including streaming. */
  timeoutMs: number;
  /** Retries after a temporary failure (rate limit, overload, network), only before any text has been shown. */
  maxRetries: number;
  /** A retry is skipped when the provider asks to wait longer than this; the user is told to try later instead. */
  maxRetryDelayMs: number;
  /** Model calls running at once in one server instance. Extra requests wait briefly, then are told the AI is busy. */
  maxConcurrency: number;
  queueWaitMs: number;
  /** Questions one member may ask per 10 minutes (shared across instances). */
  userRequestsPer10Min: number;
  /** Model calls per dealership per day (one question can take several calls when it looks things up). 0 = no limit. */
  tenantDailyCalls: number;
  /** Tokens per dealership per day. 0 = no limit. */
  tenantDailyTokens: number;
  /** Model calls per day across all dealerships, to stay inside the provider project's quota. 0 = no limit. */
  globalDailyCalls: number;
  /** Model calls per minute across all dealerships for this model (the provider's RPM quota). 0 = no limit. */
  callsPerMinute: number;
  /** Output tokens for one staff assistant call. */
  assistantMaxOutputTokens: number;
  /** Output tokens for one customer agent call. */
  customerMaxOutputTokens: number;
};

/**
 * Defaults depend on the provider: Gemini's defaults are sized for the free tier (low daily calls, short answers, few
 * concurrent calls); Claude keeps the original generous limits. Every value can be overridden with its AI_* variable.
 */
export function aiLimits(provider: ProviderId = aiConfig().provider): AiLimits {
  const free = provider === "gemini";
  return {
    // A free-tier call that has not finished in 25 s is almost always an overloaded model; saying "busy" beats a silent minute.
    timeoutMs: int("AI_TIMEOUT_MS", free ? 25_000 : 100_000, 5_000, 110_000),
    // Failed requests count against Gemini's per-minute quota too, so the free-tier default retries once.
    maxRetries: int("AI_MAX_RETRIES", free ? 1 : 2, 0, 4),
    maxRetryDelayMs: int("AI_MAX_RETRY_DELAY_MS", 8_000, 0, 30_000),
    maxConcurrency: int("AI_MAX_CONCURRENCY", free ? 3 : 8, 1, 64),
    queueWaitMs: int("AI_QUEUE_WAIT_MS", 15_000, 0, 60_000),
    userRequestsPer10Min: int("AI_USER_REQUESTS_PER_10MIN", free ? 15 : 30, 1, 1000),
    tenantDailyCalls: int("AI_TENANT_DAILY_CALLS", free ? 200 : 0, 0, 1_000_000),
    tenantDailyTokens: int("AI_TENANT_DAILY_TOKENS", free ? 400_000 : 0, 0, 1_000_000_000),
    globalDailyCalls: int("AI_GLOBAL_DAILY_CALLS", free ? 900 : 0, 0, 10_000_000),
    // The free tier allowed 5 requests per minute per model for this project when this was written (Nov 2026).
    callsPerMinute: int("AI_CALLS_PER_MINUTE", free ? 5 : 0, 0, 100_000),
    assistantMaxOutputTokens: int("AI_ASSISTANT_MAX_OUTPUT_TOKENS", free ? 2_048 : 16_000, 256, 64_000),
    customerMaxOutputTokens: int("AI_CUSTOMER_MAX_OUTPUT_TOKENS", free ? 1_024 : 2_000, 128, 16_000),
  };
}
