import { createHash } from "node:crypto";
import { plain } from "./server/db";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type Limit = { allowed: boolean; retryAfter: number };

/** In-process limiter. It is the fallback when the shared store is unreachable, so abuse is still bounded per instance. */
export function hit(key: string, limit: number, windowMs: number): Limit {
  const nowMs = Date.now();
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.resetAt < nowMs) buckets.delete(k);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < nowMs) {
    buckets.set(key, { count: 1, resetAt: nowMs + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  bucket.count += 1;
  return { allowed: bucket.count <= limit, retryAfter: Math.ceil((bucket.resetAt - nowMs) / 1000) };
}

/**
 * Shared fixed-window limiter backed by the database, so the limit holds across every instance and restart.
 * The key is hashed before it leaves the application. If the database cannot be reached the in-process limiter
 * answers instead: a database outage never turns into unlimited attempts, and never blocks a legitimate request by itself.
 */
export async function hitShared(key: string, limit: number, windowMs: number): Promise<Limit> {
  const seconds = Math.max(1, Math.ceil(windowMs / 1000));
  try {
    const keyHash = createHash("sha256").update(key).digest("hex");
    const row = (await plain((c) => c.query("SELECT * FROM intelligence_rate_hit($1, $2, $3)", [keyHash, limit, seconds]))).rows[0] as { allowed: boolean; retry_after: number } | undefined;
    if (row) return { allowed: row.allowed, retryAfter: row.allowed ? 0 : Number(row.retry_after) };
  } catch (error) {
    console.error(JSON.stringify({ event: "rate_limit_store_unavailable", message: error instanceof Error ? error.message : "unknown" }));
  }
  return hit(key, limit, windowMs);
}

/** The client address as set by the hosting proxy. Only headers the platform overwrites are trusted, never ones a client can send itself. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}
