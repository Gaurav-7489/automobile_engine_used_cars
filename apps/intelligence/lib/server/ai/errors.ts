/**
 * One error type for every provider, so routes and the UI handle failures the same way whichever model answers.
 * Messages here are safe to show and to log: they never contain a key, a prompt or provider response text.
 */
export type AiErrorKind =
  | "not_configured" // no key / bad AI_PROVIDER
  | "invalid_key" // the provider rejected the key
  | "model_unavailable" // the configured model does not exist or is not available to this key
  | "quota_exhausted" // daily/monthly quota used up (provider) or our own daily budget reached
  | "rate_limited" // too many requests right now; temporary
  | "busy" // provider overloaded, or too many AI calls running here
  | "timeout"
  | "network"
  | "bad_request" // the provider refused the request shape (a bug on our side)
  | "provider"; // anything else from the provider

export class AiError extends Error {
  readonly kind: AiErrorKind;
  readonly status?: number;
  /** Seconds the provider asked us to wait, when it said. */
  readonly retryAfter?: number;
  constructor(kind: AiErrorKind, message: string, options: { status?: number; retryAfter?: number; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AiError";
    this.kind = kind;
    this.status = options.status;
    this.retryAfter = options.retryAfter;
  }
}

/** Temporary failures worth one more try (before anything has been shown). */
export const retryable = (e: AiError): boolean => e.kind === "rate_limited" || e.kind === "busy" || e.kind === "network" || (e.kind === "provider" && (e.status ?? 0) >= 500);

/** What the person asking sees. Operators get the kind in logs and in the status endpoint. */
export function userMessage(e: unknown): string {
  const kind = e instanceof AiError ? e.kind : "provider";
  switch (kind) {
    case "not_configured": return "The assistant is not set up for this workspace yet. Ask VandLabs to enable it.";
    case "invalid_key":
    case "model_unavailable":
    case "bad_request": return "The assistant is unavailable because of a setup problem on our side. VandLabs has been notified; try again later.";
    case "quota_exhausted": return "The assistant has reached today's usage limit. It will be available again tomorrow.";
    case "rate_limited":
    case "busy": return "The assistant is busy right now. Try again in a moment.";
    case "timeout": return "The assistant took too long to answer. Try a shorter or narrower question.";
    case "network": return "The assistant could not reach the AI service. Try again in a moment.";
    default: return "The assistant could not answer that. Try again.";
  }
}

/** A log line for a failure: the kind and status only. */
export const errorFields = (e: unknown): { kind: string; status?: number } => (e instanceof AiError ? { kind: e.kind, status: e.status } : { kind: e instanceof Error ? e.name : "unknown" });
