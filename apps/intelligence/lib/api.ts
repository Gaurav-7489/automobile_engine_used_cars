import { NextResponse } from "next/server";
import type { Session } from "./domain";
import { getPrincipal } from "./server/auth";
import { loadWorkspace } from "./server/workspace";
import { redactFor } from "./server/redact";
import { resolveScope } from "./selectors";
import { FORMULA_VERSION, SNAPSHOT_AT, SNAPSHOT_ID } from "./time";

export async function currentSession(): Promise<Session | null> {
  return (await getPrincipal())?.session ?? null;
}

export function json(body: unknown, init: ResponseInit = {}): NextResponse {
  return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers ?? {}) } });
}

export const problem = (status: number, code: string, message: string, extra: Record<string, unknown> = {}): NextResponse => json({ error: { code, message, ...extra } }, { status });

/** Standard 429: machine-readable `retry_after` in the body and the standard `Retry-After` header. */
export const rateLimited = (message: string, retryAfter: number): NextResponse =>
  json({ error: { code: "rate_limited", message, retry_after: retryAfter } }, { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfter)) } });

/** Common response envelope. Null means unknown; zero means measured zero. */
export function envelope<T>(session: Session, branchId: string, data: T, dataStatus: "complete" | "partial" | "stale" | "unavailable" = "complete") {
  return {
    tenant_id: session.tid, branch_id: branchId, snapshot_id: SNAPSHOT_ID, computed_at: SNAPSHOT_AT, source_observed_at: SNAPSHOT_AT, data_status: dataStatus, formula_version: FORMULA_VERSION, data,
  };
}

/** Validate scope from the session, never from the request. Inaccessible branches return the same 404 as missing ones. */
export async function scopeFromRequest(session: Session, url: URL) {
  const requested = url.searchParams.get("branch");
  if (requested && requested !== "all" && !session.branchIds.includes(requested)) return null;
  const current = await getPrincipal();
  if (!current) return null;
  const state = redactFor(await loadWorkspace(current.principal), session);
  return { state, scope: resolveScope(state, session.branchIds, requested) };
}

export async function readJson<T>(request: Request, maxBytes = 20_000): Promise<T | null> {
  const text = await request.text();
  if (text.length > maxBytes) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
