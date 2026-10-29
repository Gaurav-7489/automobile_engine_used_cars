import { json, problem, rateLimited, readJson } from "@/lib/api";
import { isCommandList } from "@/lib/actions/registry";
import type { Command } from "@/lib/actions/recorder";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/session";
import { getPrincipal, hasRecentReauth } from "@/lib/server/auth";
import { sameOrigin } from "@/lib/server/csrf";
import { redactFor } from "@/lib/server/redact";
import { runCommands } from "@/lib/server/workspace";
import { clientKey, hitShared } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Every change to workspace data arrives here. The server repeats each operation against the authoritative state under the caller's own role and branches. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return problem(403, "forbidden", "Request origin is not allowed.");
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Sign in to continue.");
  const limit = await hitShared(`commands:${current.principal.userId}:${clientKey(request)}`, 240, 60_000);
  if (!limit.allowed) return rateLimited("Too many changes in a short time. Wait a moment.", limit.retryAfter);
  const body = await readJson<{ commands?: unknown }>(request, 400_000);
  if (!body || !isCommandList(body.commands)) return problem(422, "invalid", "Send a list of operations.");
  try {
    const outcome = await runCommands(current.principal, body.commands as Command[], await hasRecentReauth(current.principal.userId));
    const state = redactFor(outcome.state, current.session);
    if (!outcome.ok) return json({ ok: false, error: { code: outcome.code, message: outcome.message, fields: outcome.fields, latest: outcome.latest }, state }, { status: outcome.status });
    // Changed records pass through the same branch and contact redaction as everything else the browser receives.
    const visible = redactFor({ ...outcome.state, ...outcome.changes, events: [] }, current.session);
    const changes = { vehicles: visible.vehicles, leads: visible.leads, sales: visible.sales, alerts: visible.alerts };
    const response = NextResponse.json({ ok: true, state, changes, effects: outcome.effects }, { headers: { "Cache-Control": "no-store" } });
    if (outcome.effects.sessionsRevoked) {
      // Revoking "other" sessions must not end this one: issue a fresh cookie dated just after the revocation.
      const iat = Math.floor(Date.now() / 1000) + 2;
      const token = await signSession({ sub: current.principal.userId, tid: current.principal.tenantId, name: "", email: "", role: "viewer", branchIds: [], iat, exp: iat + SESSION_TTL_SECONDS });
      if (token) response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_TTL_SECONDS });
    }
    return response;
  } catch (error) {
    console.error(JSON.stringify({ event: "workspace_command_failure", user: current.principal.userId, message: error instanceof Error ? error.message : "unknown" }));
    return problem(500, "failed", "The change could not be saved. Nothing was changed. Try again.");
  }
}
