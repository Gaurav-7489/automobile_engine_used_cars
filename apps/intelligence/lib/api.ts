import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Session } from "./domain";
import { SESSION_COOKIE, verifySession } from "./session";
import { buildSeed } from "./state";
import { FORMULA_VERSION, SNAPSHOT_AT, SNAPSHOT_ID } from "./time";
import { TENANT } from "./fixtures/branches";
import { resolveScope } from "./selectors";

export async function currentSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export function json(body: unknown, init: ResponseInit = {}): NextResponse {
  return NextResponse.json(body, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers ?? {}) } });
}

export const problem = (status: number, code: string, message: string, extra: Record<string, unknown> = {}): NextResponse => json({ error: { code, message, ...extra } }, { status });

/** Common response envelope (specification page 49). Null means unknown; zero means measured zero. */
export function envelope<T>(session: Session, branchId: string, data: T, dataStatus: "complete" | "partial" | "stale" | "unavailable" = "complete") {
  return {
    tenant_id: TENANT.id, branch_id: branchId, snapshot_id: SNAPSHOT_ID, computed_at: SNAPSHOT_AT, source_observed_at: SNAPSHOT_AT, data_status: dataStatus, formula_version: FORMULA_VERSION, data,
    // The demo adapter serves the illustrative fixtures; a production adapter reads the tenant database.
    _meta: { user: session.sub, illustrative: true },
  };
}

/** Validate scope from the session, never from the request. Inaccessible branches return the same 404 as missing ones. */
export function scopeFromRequest(session: Session, url: URL) {
  const state = buildSeed();
  const requested = url.searchParams.get("branch");
  if (requested && requested !== "all" && !session.branchIds.includes(requested)) return null;
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
