/** State-changing requests must come from this site. SameSite=Lax cookies are the first layer; this is the second. */
export function sameOrigin(request: Request): boolean {
  // A bearer request with no cookie carries no ambient credential for a third-party page to borrow, so there is nothing to forge.
  if (/^Bearer /.test(request.headers.get("authorization") ?? "") && !request.headers.get("cookie")) return true;
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin) return process.env.NODE_ENV !== "production" && request.headers.get("sec-fetch-site") !== "cross-site";
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
