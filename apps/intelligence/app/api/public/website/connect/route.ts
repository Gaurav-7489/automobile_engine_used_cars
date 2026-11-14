import { json, problem, rateLimited } from "@/lib/api";
import { clientKey, hitShared } from "@/lib/rate-limit";
import { connectWebsite, disconnectWebsite } from "@/lib/server/website-connect";

export const dynamic = "force-dynamic";

/**
 * Called by a dealership website's own server (never a browser) when the owner signs in on the website's /connect page.
 * It carries a password, so it is limited exactly like sign-in, refuses cookies, and answers only in JSON.
 */
export async function POST(request: Request) {
  // A browser on another site could be tricked into posting here; a server-to-server call never carries this site's cookies.
  if (request.headers.get("cookie")) return problem(403, "forbidden", "This endpoint is for a website's server.");
  const text = await request.text();
  if (text.length > 4_000) return problem(413, "too_large", "Request is too large.");
  let body: Record<string, unknown>;
  try { body = JSON.parse(text) as Record<string, unknown>; } catch { return problem(422, "invalid", "Send valid JSON."); }
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const email = str(body.email).trim().toLowerCase();
  const password = str(body.password);
  if (!email || !password) return problem(422, "invalid", "Enter your Intelligence email and password.");
  const limit = await hitShared(`login:${clientKey(request)}:${email}`, 8, 10 * 60_000);
  const ipLimit = await hitShared(`login-ip:${clientKey(request)}`, 40, 10 * 60_000);
  if (!limit.allowed || !ipLimit.allowed) {
    const wait = Math.max(limit.retryAfter, ipLimit.retryAfter);
    return rateLimited(`Too many sign-in attempts. Wait ${Math.ceil(wait / 60)} minutes and try again.`, wait);
  }
  const input = { email, password, code: str(body.code) || undefined, key: str(body.key), siteUrl: str(body.siteUrl) };
  try {
    if (body.action === "disconnect") {
      const result = await disconnectWebsite(input);
      return result.ok ? json(result) : problem(result.status, result.code, result.message);
    }
    const result = await connectWebsite(input);
    return result.ok ? json(result, { status: 201 }) : problem(result.status, result.code, result.message);
  } catch (error) {
    console.error(JSON.stringify({ event: "website_connect_failure", message: error instanceof Error ? error.message : "unknown" }));
    return problem(503, "unavailable", "The connection could not be completed just now. Try again in a moment.");
  }
}
