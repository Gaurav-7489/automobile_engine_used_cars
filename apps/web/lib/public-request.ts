import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";

type Environment = Record<string, string | undefined>;
type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();
const script = "local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end;return {n,redis.call('PTTL',KEYS[1])}";

export function requestIdentity(request: Request, env: Environment = process.env): string {
  // Only trust platform-injected headers or a proxy that the operator explicitly trusts.
  const header = env.VERCEL === "1" ? "x-forwarded-for" : env.RATE_LIMIT_TRUSTED_IP_HEADER;
  const value = header ? request.headers.get(header)?.split(",")[0].trim() : undefined;
  return value && isIP(value) ? value : "shared-unknown-client";
}

export async function limitPublicRequest(request: Request, scope: string, max: number, windowMs = 60000, options: {
  env?: Environment; clock?: () => number; fetcher?: typeof fetch;
} = {}): Promise<Response | null> {
  const env = options.env ?? process.env;
  const now = (options.clock ?? Date.now)();
  const key = "engine:limit:" + createHash("sha256").update(`${env.RATE_LIMIT_NAMESPACE ?? "default"}|${scope}|${requestIdentity(request, env)}`).digest("hex");
  let count: number, ttl: number;
  try {
    if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
      const url = new URL(env.UPSTASH_REDIS_REST_URL);
      if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error();
      const response = await (options.fetcher ?? fetch)(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` }, body: JSON.stringify(["EVAL", script, "1", key, String(windowMs)]), signal: AbortSignal.timeout(2500), cache: "no-store" });
      if (!response.ok) throw new Error();
      const data: unknown = await response.json();
      const result = data && typeof data === "object" ? (data as { result?: unknown }).result : null;
      if (!Array.isArray(result) || result.length !== 2 || !Number.isSafeInteger(result[0]) || result[0] < 1 || !Number.isSafeInteger(result[1]) || result[1] < 0) throw new Error();
      [count, ttl] = result;
    } else {
      if (env.DATA_MODE === "aurora" || env.VERCEL === "1") throw new Error();
      for (const [id, bucket] of buckets) if (bucket.reset <= now) buckets.delete(id);
      let bucket = buckets.get(key);
      if (!bucket) { if (buckets.size >= 10000) throw new Error(); bucket = { count: 0, reset: now + windowMs }; buckets.set(key, bucket); }
      count = ++bucket.count; ttl = bucket.reset - now;
    }
  } catch {
    return NextResponse.json({ error: "Request protection is unavailable. Please try again shortly." }, { status: 503, headers: { "Retry-After": "30", "Cache-Control": "no-store" } });
  }
  const threshold = requestIdentity(request, env) === "shared-unknown-client" ? Math.max(max, 120) : max;
  return count > threshold ? NextResponse.json({ error: "Too many requests. Please wait before trying again." }, { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(ttl / 1000))), "Cache-Control": "no-store" } }) : null;
}

export function publicOriginFailure(request: Request): Response | null {
  const origin = request.headers.get("origin");
  let valid = request.headers.get("sec-fetch-site") !== "cross-site";
  if (origin) {
    try {
      // Next's internal Request URL may use localhost while the browser uses the
      // incoming Host. Prefer an explicit deployed origin, otherwise the direct
      // Host authority; never accept an arbitrary forwarded-host value.
      const internal = new URL(request.url);
      const authority = request.headers.get("host") ?? internal.host;
      const expected = new URL(process.env.APP_ORIGIN ?? `${internal.protocol}//${authority}`).origin;
      const supplied = new URL(origin);
      valid = valid && supplied.origin === expected && !supplied.username && !supplied.password;
    } catch { valid = false; }
  }
  if (!valid) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  return null;
}

export async function publicJson(request: Request, maxBytes = 16384): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json") || !request.body) throw new SyntaxError();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength; if (size > maxBytes) { await reader.cancel(); throw new SyntaxError(); } chunks.push(item.value); } }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SyntaxError();
  return value as Record<string, unknown>;
}
