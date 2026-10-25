import { NextResponse } from "next/server";
import { problem } from "../api";
import { clientKey, hit } from "../rate-limit";
import { authenticateApiKey, type ApiCaller, type ApiScope } from "./api-keys";

/** Shared gate for the read-only /api/v1 endpoints: key, scope and a per-key rate limit. */
export async function withApiKey(request: Request, scope: ApiScope, read: (caller: ApiCaller) => Promise<unknown>): Promise<NextResponse> {
  const ip = hit(`api-ip:${clientKey(request)}`, 120, 60_000);
  if (!ip.allowed) return problem(429, "rate_limited", "Too many requests.", { retry_after: ip.retryAfter });
  let caller: ApiCaller | null;
  try { caller = await authenticateApiKey(request.headers.get("authorization")); } catch { return problem(503, "unavailable", "Service temporarily unavailable."); }
  if (!caller) return problem(401, "unauthenticated", "Send a valid, unexpired API key as `Authorization: Bearer <key>`.");
  if (caller.scope !== scope) return problem(403, "forbidden", `This key does not have the ${scope} scope.`);
  const limit = hit(`api-key:${caller.keyId}`, 60, 60_000);
  if (!limit.allowed) return problem(429, "rate_limited", "This key is over 60 requests per minute.", { retry_after: limit.retryAfter });
  const data = await read(caller);
  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
}
