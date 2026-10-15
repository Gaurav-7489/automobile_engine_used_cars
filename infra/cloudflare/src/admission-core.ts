/** Pure bounded admission policy shared by the durable coordinator and regressions. */
export function validLimit(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= max;
}
export function takeBucket(bucket: { count: number; reset: number } | undefined, now: number, windowMs: number, limit: number) {
  const current = !bucket || bucket.reset <= now ? { count: 0, reset: now + windowMs } : { ...bucket };
  current.count = Math.min(limit + 1, current.count + 1);
  return { bucket: current, allowed: current.count <= limit, retryAfter: Math.max(1, Math.ceil((current.reset - now) / 1000)) };
}
export function cleanMediaKey(path: string): string | null {
  return /^\/[a-z0-9-]+\/[0-9a-f-]{36}\.(webp|avif)$/.test(path) ? path.slice(1) : null;
}
export function surface(path: string) {
  return path === "/command" || path.startsWith("/command/") ? "COMMAND" : path === "/platform" || path.startsWith("/platform/") ? "PLATFORM" : "WEB";
}
