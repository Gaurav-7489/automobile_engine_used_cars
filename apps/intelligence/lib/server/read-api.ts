import { randomUUID } from "node:crypto";
import { json, problem } from "../api";
import { can, type Capability } from "../permissions";
import { getPrincipal } from "./auth";
import { tenantTx, type SqlClient } from "./db";
import type { Principal } from "./identity";
import { syncReadModel } from "./read-model";
import { enterLive } from "./workspace";

export type ReadContext = { c: SqlClient; principal: Principal; role: Principal["role"]; branchIds: string[]; url: URL };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Shared wrapper for page-shaped reads. The caller's tenant and branches come from the signed, database-validated session;
 * `branches=` in the URL can only narrow what the member may already see. Failures are logged with a correlation id and
 * returned without internals.
 */
export async function readRoute(request: Request, capability: Capability | Capability[] | null, handler: (ctx: ReadContext) => Promise<unknown>): Promise<Response> {
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Your session has expired. Sign in again.");
  const { principal } = current;
  if (capability && ![capability].flat().some((cap) => can(principal.role, cap))) return problem(403, "forbidden", "Your role cannot view this.");
  const url = new URL(request.url);
  const asked = (url.searchParams.get("branches") ?? "").split(",").filter((id) => UUID.test(id));
  const branchIds = asked.length ? asked.filter((id) => principal.locationIds.includes(id)) : principal.locationIds;
  const started = Date.now();
  try {
    enterLive();
    const body = await tenantTx(principal.tenantId, async (c) => {
      await syncReadModel(c, principal.tenantId);
      return handler({ c, principal, role: principal.role, branchIds, url });
    });
    const response = json(body);
    response.headers.set("Server-Timing", `app;dur=${Date.now() - started}`);
    return response;
  } catch (error) {
    const id = randomUUID().slice(0, 8);
    console.error(JSON.stringify({ event: "read_route_failure", id, path: url.pathname, user: principal.userId, message: error instanceof Error ? error.message : "unknown" }));
    return problem(500, "failed", "We could not load this. Try again.", { reference: id });
  }
}

export const intParam = (url: URL, name: string, fallback: number, min: number, max: number): number => {
  const n = Number(url.searchParams.get(name));
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};
export const choice = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);
