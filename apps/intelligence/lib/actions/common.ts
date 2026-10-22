import type { Role } from "../domain";
import { can, requiredRoleText, type Capability } from "../permissions";
import type { WorkspaceState } from "../state";
import { now } from "../clock";

export type Actor = { sub: string; name: string; role: Role; branchIds: string[] };

export type Fail = {
  ok: false;
  status: 403 | 404 | 409 | 422 | 429;
  code: "forbidden" | "not_found" | "conflict" | "invalid" | "rate_limited";
  message: string;
  fields?: Record<string, string>;
  /** Safe diff metadata for 409 conflicts: the latest server version the UI can show next to the user's draft. */
  latest?: Record<string, unknown>;
};

export type Ok<T = object> = { ok: true; state: WorkspaceState } & T;
export type Result<T = object> = Ok<T> | Fail;

export const fail = (status: Fail["status"], code: Fail["code"], message: string, extra: Partial<Pick<Fail, "fields" | "latest">> = {}): Fail => ({ ok: false, status, code, message, ...extra });
export const ok = <T extends object = object>(state: WorkspaceState, extra?: T): Ok<T> => ({ ok: true, state, ...(extra ?? ({} as T)) });

export function guard(actor: Actor, capability: Capability): Fail | null {
  return can(actor.role, capability) ? null : fail(403, "forbidden", requiredRoleText(capability));
}

export function branchGuard(actor: Actor, branchId: string): Fail | null {
  return actor.branchIds.includes(branchId) ? null : fail(404, "not_found", "Record not found."); // 404 hides inaccessible records
}

export function nextId(prefix: string, existing: readonly string[], start: number): string {
  const numbers = existing.filter((id) => id.startsWith(`${prefix}-`)).map((id) => Number(id.slice(prefix.length + 1))).filter((n) => Number.isFinite(n));
  return `${prefix}-${Math.max(start - 1, ...numbers) + 1}`;
}

export function withAudit(state: WorkspaceState, actor: Actor, action: string, target: string, detail: string): WorkspaceState {
  const id = `AU-${9100 + state.audit.length + 1}`;
  return { ...state, audit: [{ id, at: now(), actor: actor.name, action, target, detail }, ...state.audit] };
}

export const trim = (value: string | undefined | null): string => (value ?? "").trim();
