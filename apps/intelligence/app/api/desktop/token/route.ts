import { NextResponse } from "next/server";
import { problem, rateLimited, readJson } from "@/lib/api";
import { clientKey, hitShared } from "@/lib/rate-limit";
import { redeemCode } from "@/lib/server/desktop";

export const dynamic = "force-dynamic";

/** Public endpoint (the desktop app has no session yet): protected by the one-time, one-minute, verifier-bound code and a per-address limit. */
export async function POST(request: Request) {
  const limit = await hitShared(`desktop-token:${clientKey(request)}`, 30, 60_000);
  if (!limit.allowed) return rateLimited("Too many attempts. Wait a moment.", limit.retryAfter);
  const body = await readJson<{ grant_type?: unknown; code?: unknown; code_verifier?: unknown }>(request, 4_000);
  if (!body || body.grant_type !== "authorization_code") return problem(400, "invalid", "Unsupported request.");
  const result = await redeemCode(body.code, body.code_verifier);
  if (!result.ok) return problem(result.status, "invalid", result.message);
  return NextResponse.json({ access_token: result.token, token_type: "Bearer", expires_in: result.expiresIn }, { headers: { "Cache-Control": "no-store" } });
}
