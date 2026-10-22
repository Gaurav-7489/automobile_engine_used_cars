type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** Best-effort in-process limiter. Production deployments should back this with the platform rate-limit service. */
export function hit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfter: number } {
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

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}
