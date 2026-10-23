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

/** Deterministic UUID-shaped id from a seed, so client and server derive the same id for the same command. */
export function pseudoUuid(seed: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57, h3 = 0x9e3779b9, h4 = 0x85ebca6b;
  for (let i = 0; i < seed.length; i += 1) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); h3 = Math.imul(h3 ^ ch, 2246822507); h4 = Math.imul(h4 ^ ch, 3266489909);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h3 ^ (h3 >>> 13), 3266489909);
  h3 = Math.imul(h3 ^ (h3 >>> 16), 2246822507) ^ Math.imul(h4 ^ (h4 >>> 13), 3266489909);
  h4 = Math.imul(h4 ^ (h4 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hex = [h1, h2, h3, h4].map((n) => (n >>> 0).toString(16).padStart(8, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${"89ab"[parseInt(hex[16], 16) % 4]}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Live workspaces number from 1001; sample fixtures keep their illustrative offsets. */
export const seq = (state: WorkspaceState, sample: number): number => (state.live ? 1001 : sample);

export function nextId(prefix: string, existing: readonly string[], start: number): string {
  const numbers = existing.filter((id) => id.startsWith(`${prefix}-`)).map((id) => Number(id.slice(prefix.length + 1))).filter((n) => Number.isFinite(n));
  return `${prefix}-${Math.max(start - 1, ...numbers) + 1}`;
}

export function withAudit(state: WorkspaceState, actor: Actor, action: string, target: string, detail: string): WorkspaceState {
  // Live audit ids never repeat even though only recent entries are loaded; sample ids stay sequential.
  const id = state.live ? `AU-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}` : `AU-${9100 + state.audit.length + 1}`;
  return { ...state, audit: [{ id, at: now(), actor: actor.name, action, target, detail }, ...state.audit] };
}

export const trim = (value: string | undefined | null): string => (value ?? "").trim();
