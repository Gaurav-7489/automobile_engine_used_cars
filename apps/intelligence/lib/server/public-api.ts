import { NextResponse } from "next/server";
import { problem, rateLimited } from "../api";
import { clientKey, hitShared } from "../rate-limit";
import { authenticateApiKey, type ApiCaller, type ApiScope } from "./api-keys";

/** Shared gate for the read-only /api/v1 endpoints: key, scope and a per-key rate limit. */
export async function withApiKey(request: Request, scope: ApiScope, read: (caller: ApiCaller) => Promise<unknown>): Promise<NextResponse> {
  const ip = await hitShared(`api-ip:${clientKey(request)}`, 120, 60_000);
  if (!ip.allowed) return rateLimited("Too many requests.", ip.retryAfter);
  let caller: ApiCaller | null;
  try { caller = await authenticateApiKey(request.headers.get("authorization")); } catch { return problem(503, "unavailable", "Service temporarily unavailable."); }
  if (!caller) return problem(401, "unauthenticated", "Send a valid, unexpired API key as `Authorization: Bearer <key>`.");
  if (caller.scope !== scope) return problem(403, "forbidden", `This key does not have the ${scope} scope.`);
  const limit = await hitShared(`api-key:${caller.keyId}`, 60, 60_000);
  if (!limit.allowed) return rateLimited("This key is over 60 requests per minute.", limit.retryAfter);
  const data = await read(caller);
  return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
}
