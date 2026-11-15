import { cookies } from "next/headers";
import { json, problem, rateLimited, readJson } from "@/lib/api";
import { clientKey, hitShared } from "@/lib/rate-limit";
import { sameOrigin } from "@/lib/server/csrf";
import { ACCESS_COOKIE, readAccessCookie, submitAccessRequest, validateAccessRequest } from "@/lib/server/access-requests";

export const dynamic = "force-dynamic";

/**
 * Submits an access request for the Google account that just signed in without access. The identity comes only from the signed
 * cookie the Google callback set; nothing in the request body can choose the email.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const identity = await readAccessCookie((await cookies()).get(ACCESS_COOKIE)?.value);
  if (!identity) return problem(401, "unauthenticated", "Sign in with Google again, then send your request.");
  const ip = await hitShared(`access-request-ip:${clientKey(request)}`, 10, 60 * 60_000);
  const who = await hitShared(`access-request:${identity.sub}`, 5, 60 * 60_000);
  if (!ip.allowed || !who.allowed) return rateLimited("Too many requests. Try again later.", Math.max(ip.retryAfter, who.retryAfter));
  const body = (await readJson<Record<string, unknown>>(request, 4_000)) ?? {};
  const { input, fields } = validateAccessRequest(body);
  if (!input) return problem(422, "invalid", "Please check the highlighted details.", { fields });
  try {
    const outcome = await submitAccessRequest(identity, input);
    if (outcome === "has_account") return problem(409, "has_account", "This Google account already has access. Sign in again.");
    if (outcome === "declined_recently") return problem(403, "declined", "Recent requests from this account were declined. Contact VandLabs support.");
    console.info(JSON.stringify({ event: "access_request_submitted", outcome }));
    return json({ ok: true, outcome }, { status: outcome === "created" ? 201 : 200 });
  } catch (error) {
    console.error(JSON.stringify({ event: "access_request_failure", message: error instanceof Error ? error.message : "unknown" }));
    return problem(503, "unavailable", "Your request could not be sent just now. Try again in a moment.");
  }
}
