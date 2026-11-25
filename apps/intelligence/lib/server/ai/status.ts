import { aiConfig, type ProviderId } from "./config";
import { providerFromEnv } from "./engine";
import { AiError, type AiErrorKind } from "./errors";

/**
 * What the AI features can honestly say about themselves: which provider and model are selected, whether a key is set, and
 * whether the provider accepted the key and knows the model the last time it was checked. The check reads the model's
 * metadata, which uses no generation quota. A model can still exist and be overloaded or retired for new keys, so the last
 * real call's outcome is reported separately by the caller (from the usage ledger).
 */
export type AiStatus = {
  provider: ProviderId;
  model: string;
  configured: boolean;
  problem: string | null;
  availability: "unchecked" | "ok" | AiErrorKind;
  checkedAt: string | null;
};

const TTL_OK = 10 * 60_000;
const TTL_FAILED = 60_000;
let cache: { key: string; at: number; availability: AiStatus["availability"] } | null = null;

export const aiConfigured = (): boolean => aiConfig().configured;

export async function aiStatus(options: { check?: boolean } = {}): Promise<AiStatus> {
  const cfg = aiConfig();
  const base = { provider: cfg.provider, model: cfg.model, configured: cfg.configured, problem: cfg.problem };
  if (!cfg.configured) return { ...base, availability: "not_configured", checkedAt: null };
  const key = `${cfg.provider}:${cfg.model}`;
  const fresh = cache && cache.key === key && Date.now() - cache.at < (cache.availability === "ok" ? TTL_OK : TTL_FAILED);
  if (!fresh && options.check) {
    let availability: AiStatus["availability"] = "ok";
    try {
      await providerFromEnv().probe(AbortSignal.timeout(8_000));
    } catch (error) {
      availability = error instanceof AiError ? error.kind : "provider";
      console.error(JSON.stringify({ event: "ai_probe_failure", provider: cfg.provider, model: cfg.model, kind: availability }));
    }
    cache = { key, at: Date.now(), availability };
  }
  const current = cache && cache.key === key ? cache : null;
  return { ...base, availability: current?.availability ?? "unchecked", checkedAt: current ? new Date(current.at).toISOString() : null };
}

/** Test hook. */
export const resetAiStatusCache = (): void => { cache = null; };
