import { randomUUID } from "node:crypto";
import { requireCapability, type AuthenticatedPrincipal, type CommerceState, type FeedFailure, type FeedSync } from "@vandlabs/contracts";
import type { CommerceRepository } from "./commerce";
import { allowedSource, CommerceError, ingestBatch } from "./commerce-rules";
import { objectBody } from "./http";

type Environment = Record<string, string | undefined>;
class FeedError extends CommerceError {
  constructor(public readonly category: FeedFailure, retryAfter?: number) {
    super(503, "Source synchronization failed. Check the source status before retrying.", retryAfter);
  }
}
function endpoint(env: Environment, tenantId: string, sourceId: string) {
  try {
    const feeds: unknown = JSON.parse(env.VANDLABS_FEEDS_JSON ?? "[]");
    if (!Array.isArray(feeds) || feeds.length > 200) throw new Error();
    const matches = feeds.filter(f => f && f.tenantId === tenantId && f.sourceId === sourceId);
    if (matches.length !== 1) throw new Error();
    const config = matches[0], url = new URL(config.url);
    // Only administrator-configured public DNS endpoints are supported. Reject
    // literal IPs (including WHATWG-normalized numeric IPv4), local names and redirects.
    if (url.protocol !== "https:" || url.username || url.password || url.hash ||
        !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(url.hostname) || /^[\d.]+$/.test(url.hostname) ||
        /(?:^|\.)(?:localhost|local|internal|lan|home|invalid|test)$/i.test(url.hostname) ||
        !/^VANDLABS_FEED_TOKEN_[A-Z0-9_]{1,40}$/.test(config.tokenEnv)) throw new Error();
    const tokens: unknown = JSON.parse(env.VANDLABS_FEED_TOKENS_JSON ?? "{}");
    if (!tokens || typeof tokens !== "object" || Array.isArray(tokens)) throw new Error();
    const token = (tokens as Record<string, unknown>)[config.tokenEnv] ?? env[config.tokenEnv];
    if (typeof token !== "string" || !token.trim() || token.length > 8192 || /[\r\n]/.test(token)) throw new Error();
    const minIntervalSeconds = config.minIntervalSeconds ?? 60;
    if (!Number.isSafeInteger(minIntervalSeconds) || minIntervalSeconds < 60 || minIntervalSeconds > 86400) throw new Error();
    return { url, token, minIntervalSeconds };
  } catch { throw new FeedError("configuration"); }
}
function retryDelay(value: string | null, now: Date) {
  if (!value) return undefined;
  const seconds = /^\d+$/.test(value) ? Number(value) : (Date.parse(value) - now.getTime()) / 1000;
  return Number.isFinite(seconds) ? Math.max(60, Math.min(3600, Math.ceil(seconds))) : undefined;
}
function history(state: CommerceState, sourceId: string, run: FeedSync) {
  state.syncHistory = [{ ...run, sourceId }, ...(state.syncHistory ?? [])].slice(0, 200);
}
export function sourceSyncSummary(state: CommerceState, sourceId: string, now: Date) {
  const run = state.sourceSync?.find(run => run.sourceId === sourceId);
  if (!run) return null;
  const running = run.status === "running" && Date.parse(run.leaseExpiresAt) > now.getTime();
  const status: FeedSync["status"] | "interrupted" = run.status === "running" && !running ? "interrupted" : run.status;
  return { status,
    lastAttemptAt: run.startedAt, lastSucceededAt: run.lastSucceededAt, completedAt: run.completedAt,
    nextAttemptAt: run.nextAttemptAt, error: run.error, received: run.received, fuelReceived: run.fuelReceived,
    canSync: !running && (!run.nextAttemptAt || Date.parse(run.nextAttemptAt) <= now.getTime()) };
}

// Claim/commit operations are short tenant transactions. Network I/O never holds
// a PostgreSQL transaction open. The run ID prevents an expired worker from
// overwriting a newer attempt. Existing JSON payloads need no schema migration.
export function providerSync(repository: CommerceRepository, options: { env?: Environment; clock?: () => Date; request?: typeof fetch } = {}) {
  const env = options.env ?? process.env, clock = options.clock ?? (() => new Date()), request = options.request ?? fetch;
  return async (principal: AuthenticatedPrincipal, sourceId: string) => {
    requireCapability(principal, "commerce:manage");
    const runId = randomUUID(), started = clock();
    await repository.transact(principal.tenantId, state => {
      const source = state.sources.find(s => s.id === sourceId);
      if (!allowedSource(source, false, started) || source?.kind !== "licensed_api") throw new CommerceError(403, "An active licensed provider agreement is required.");
      const previous = state.sourceSync?.find(run => run.sourceId === sourceId);
      if (previous?.status === "running" && Date.parse(previous.leaseExpiresAt) > started.getTime()) throw new CommerceError(409, "This source is already synchronizing.");
      if (previous?.nextAttemptAt && Date.parse(previous.nextAttemptAt) > started.getTime()) throw new CommerceError(429, "Wait until the source retry time.", Math.ceil((Date.parse(previous.nextAttemptAt) - started.getTime()) / 1000));
      if (previous?.status === "running") history(state, sourceId, { ...previous, status: "failed", completedAt: started.toISOString(), error: "lease_expired" });
      state.sourceSync = [{ sourceId, runId, status: "running", startedAt: started.toISOString(),
        completedAt: null, leaseExpiresAt: new Date(started.getTime() + 60000).toISOString(),
        lastSucceededAt: previous?.lastSucceededAt ?? null, consecutiveFailures: previous?.consecutiveFailures ?? 0,
        nextAttemptAt: null, error: null, received: null, fuelReceived: null }, ...(state.sourceSync ?? []).filter(run => run.sourceId !== sourceId)];
    });
    try {
      const config = endpoint(env, principal.tenantId, sourceId);
      let response: Response;
      try { response = await request(config.url, { headers: { authorization: `Bearer ${config.token}`, accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(10000), cache: "no-store" }); }
      catch { throw new FeedError("provider_unavailable"); }
      if (!response.ok) {
        await response.body?.cancel();
        throw new FeedError(response.status === 401 || response.status === 403 ? "provider_auth" : response.status === 429 ? "provider_rate_limit" : "provider_unavailable", retryDelay(response.headers.get("retry-after"), clock()));
      }
      if (!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:;|$)/i.test(response.headers.get("content-type") ?? "")) { await response.body?.cancel(); throw new FeedError("invalid_payload"); }
      let payload: Record<string, unknown>;
      try { payload = await objectBody(new Request("https://feed.internal", { method: "POST", body: response.body, duplex: "half" } as RequestInit)); }
      catch { throw new FeedError("invalid_payload"); }
      return await repository.transact(principal.tenantId, state => {
        const run = state.sourceSync?.find(run => run.sourceId === sourceId), now = clock();
        if (!run || run.runId !== runId || run.status !== "running" || Date.parse(run.leaseExpiresAt) <= now.getTime()) throw new CommerceError(409, "Sync lease expired; a new attempt is required.");
        // Recheck the source agreement at commit and validate the complete batch
        // before changing records. External sourcing never updates owned inventory.
        const result = ingestBatch(state, sourceId, payload, now);
        Object.assign(run, { status: "succeeded", completedAt: now.toISOString(), lastSucceededAt: now.toISOString(), consecutiveFailures: 0, nextAttemptAt: new Date(now.getTime() + config.minIntervalSeconds * 1000).toISOString(), error: null, received: result.received, fuelReceived: result.fuelReceived });
        history(state, sourceId, run);
        return result;
      });
    } catch (error) {
      const category: FeedFailure = error instanceof FeedError ? error.category : error instanceof CommerceError && error.status === 403 ? "agreement" : error instanceof CommerceError && error.message.startsWith("Sync lease") ? "lease_expired" : "invalid_payload";
      const cooldown = await repository.transact(principal.tenantId, state => {
        const run = state.sourceSync?.find(run => run.sourceId === sourceId);
        if (!run || run.runId !== runId || run.status !== "running") return;
        const now = clock(), failures = Math.min(run.consecutiveFailures + 1, 1000);
        const delay = error instanceof FeedError && error.retryAfter ? error.retryAfter : Math.min(3600, 60 * 2 ** Math.min(failures - 1, 6));
        Object.assign(run, { status: "failed", completedAt: now.toISOString(), consecutiveFailures: failures,
          nextAttemptAt: new Date(now.getTime() + delay * 1000).toISOString(), error: category });
        history(state, sourceId, run);
        return delay;
      });
      if (error instanceof CommerceError && error.status === 409) throw error;
      throw new FeedError(category, cooldown ?? (error instanceof FeedError ? error.retryAfter : undefined));
    }
  };
}
