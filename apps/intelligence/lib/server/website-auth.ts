import { NextResponse } from "next/server";
import { problem, rateLimited } from "../api";
import { clientKey, hitShared } from "../rate-limit";
import { authenticateApiKey, scopeAllows, type ApiCaller } from "./api-keys";
import { websiteOf, isWebsiteKeyName } from "./website-connect";

export type WebsiteRequestCaller = ApiCaller & { site: string };

/**
 * Gate for endpoints a connected dealership website's server calls: per-address limit, a valid unexpired key with the website
 * scope (or a legacy website connection), then a per-key limit. The workspace is the key's, never anything in the request.
 */
export async function websiteCaller(request: Request, opts: { perKeyPerMinute: number }): Promise<{ caller: WebsiteRequestCaller } | { response: NextResponse }> {
  const ip = await hitShared(`api-ip:${clientKey(request)}`, 240, 60_000);
  if (!ip.allowed) return { response: rateLimited("Too many requests.", ip.retryAfter) };
  let caller: ApiCaller | null;
  try { caller = await authenticateApiKey(request.headers.get("authorization")); } catch { return { response: problem(503, "unavailable", "Service temporarily unavailable.") }; }
  if (!caller) return { response: problem(401, "unauthenticated", "Send a valid, unexpired website key as `Authorization: Bearer <key>`.") };
  if (!scopeAllows(caller, "website")) return { response: problem(403, "forbidden", "This key is not a website connection.") };
  const limit = await hitShared(`website-key:${caller.keyId}:${new URL(request.url).pathname}`, opts.perKeyPerMinute, 60_000);
  if (!limit.allowed) return { response: rateLimited("This website is sending too many requests.", limit.retryAfter) };
  return { caller: { ...caller, site: isWebsiteKeyName(caller.name) ? websiteOf(caller.name) : "" } };
}

/** Reads a JSON object body of at most `max` characters. */
export async function jsonBody(request: Request, max: number): Promise<{ body: Record<string, unknown> } | { response: NextResponse }> {
  if (Number(request.headers.get("content-length") ?? 0) > max) return { response: problem(413, "too_large", "Request is too large.") };
  const text = await request.text();
  if (text.length > max) return { response: problem(413, "too_large", "Request is too large.") };
  try {
    const body = JSON.parse(text) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not an object");
    return { body: body as Record<string, unknown> };
  } catch {
    return { response: problem(422, "invalid", "Send a JSON object.") };
  }
}
