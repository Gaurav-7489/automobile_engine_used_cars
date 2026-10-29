"use client";

import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@/lib/domain";
import { ALL_BRANCHES } from "@/lib/fixtures/branches";
import { setLive } from "@/lib/mode";
import { can as canDo, type Capability } from "@/lib/permissions";
import { resolveScope } from "@/lib/selectors";
import { setAsOf } from "@/lib/time";
import type { WorkspaceState } from "@/lib/state";
import { recordCommands, type Command } from "@/lib/actions";
import type { Actor, Fail, Result } from "@/lib/actions";

export type Effects = { inviteLinks: { email: string; token: string; expiresAt: string }[]; sessionsRevoked: boolean };

type Ctx = {
  state: WorkspaceState;
  session: Session;
  actor: Actor;
  can: (capability: Capability) => boolean;
  /** Runs a domain action for immediate feedback; the server repeats it authoritatively and its result replaces the local one. */
  run: <R extends Result<object>>(fn: (state: WorkspaceState, actor: Actor) => R) => R;
  /** Same as run for actions that hash or fetch before returning. These run locally only. */
  runAsync: <R extends Result<object>>(fn: (state: WorkspaceState, actor: Actor) => Promise<R>) => Promise<R>;
  /** Kept for sample-mode screens; a live workspace waits for real provider acknowledgement and never fakes one. */
  queueAck: (campaignId: string) => void;
  scope: { ids: string[]; value: string; label: string };
  demoState: "normal" | "loading" | "empty" | "error" | "partial";
  hydrated: boolean;
  saving: boolean;
  /** Reload the authoritative state now. */
  refresh: () => Promise<void>;
  /** Adds or replaces records a page fetched, so actions on them work locally. Live workspaces hold only the records the visible pages loaded. */
  mergeRecords: (records: Partial<Pick<WorkspaceState, "vehicles" | "leads" | "sales" | "alerts">>) => void;
  /** Increases whenever the server's truth may have moved (a refresh, a saved change, a failed change); remote reads reload on it. */
  epoch: number;
};

type Created = { vehicles: string[]; leads: string[]; sales: string[] };
type Mergeable = "vehicles" | "leads" | "sales" | "alerts";
const upsert = <T extends { id: string }>(current: T[], incoming: T[]): T[] => {
  if (!incoming.length) return current;
  const byId = new Map(incoming.map((x) => [x.id, x]));
  const merged = current.map((x) => byId.get(x.id) ?? x);
  const known = new Set(current.map((x) => x.id));
  for (const x of incoming) if (!known.has(x.id)) merged.push(x);
  return merged;
};

const WorkspaceContext = createContext<Ctx | null>(null);

export function useWorkspace(): Ctx {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

const defaultBranchOf = (state: Pick<WorkspaceState, "branches">): string => (state.branches.find((b) => b.isDefault) ?? state.branches[0])?.id ?? "";
export { defaultBranchOf };

function emptied(state: WorkspaceState): WorkspaceState {
  return { ...state, vehicles: [], sales: [], events: [], leads: [], alerts: [], priceRequests: [], campaigns: [], savedSearches: [], watchlist: [] };
}

function Inner({ session, initialState, asOf, children }: { session: Session; initialState: WorkspaceState; asOf: string; children: ReactNode }) {
  // Live mode and the "as of" instant must be set before any child renders so server rendering and hydration agree.
  setLive(true);
  setAsOf(asOf);
  const router = useRouter();
  const params = useSearchParams();
  const demoParam = params.get("demo_state");
  const demoState = (["loading", "empty", "error", "partial"] as const).find((v) => v === demoParam) ?? "normal";
  const [state, setState] = useState<WorkspaceState>(initialState);
  const [saving, setSaving] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const demoRef = useRef(demoState);
  demoRef.current = demoState;
  const pending = useRef(0);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const active = demoState === "empty" ? emptied(state) : state;

  const actor = useMemo<Actor>(() => ({ sub: session.sub, name: session.name, role: session.role, branchIds: session.branchIds }), [session]);

  const refresh = useCallback(async () => {
    if (pending.current > 0) return;
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      if (response.status === 401) { router.replace("/login?reason=expired"); return; }
      if (!response.ok) return;
      const body = (await response.json()) as { state: WorkspaceState; as_of: string };
      if (pending.current > 0) return;
      setAsOf(body.as_of);
      const cached = stateRef.current;
      const next: WorkspaceState = body.state.partial ? { ...body.state, vehicles: cached.vehicles, leads: cached.leads, sales: cached.sales, alerts: cached.alerts } : body.state;
      stateRef.current = next;
      setState(next);
      setEpoch((n) => n + 1);
    } catch { /* keep the current state; the next refresh retries */ }
  }, [router]);

  useEffect(() => {
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 60_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, [refresh]);

  const send = useCallback((commands: Command[], created: Created) => {
    pending.current += 1;
    setSaving(true);
    chain.current = chain.current.then(async () => {
      try {
        const response = await fetch("/api/workspace/commands", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ commands }) });
        if (response.status === 401) { router.replace("/login?reason=expired"); return; }
        const body = (await response.json().catch(() => null)) as { ok?: boolean; state?: WorkspaceState; changes?: Pick<WorkspaceState, Mergeable>; effects?: Effects; error?: { message?: string } } | null;
        if (body?.state && pending.current <= 1) {
          // The server returns the small collections plus the records this change touched; cached records it did not touch stay as they are.
          const cached = stateRef.current;
          const merged: WorkspaceState = body.state.partial
            ? { ...body.state, vehicles: upsert(cached.vehicles, body.changes?.vehicles ?? []), leads: upsert(cached.leads, body.changes?.leads ?? []), sales: upsert(cached.sales, body.changes?.sales ?? []), alerts: upsert(cached.alerts, body.changes?.alerts ?? []) }
            : body.state;
          // Records this device created optimistically are confirmed by the server's copy (same id) or dropped (a different id was issued, or the change was refused).
          const confirmed = { vehicles: new Set((body.changes?.vehicles ?? []).map((x) => x.id)), leads: new Set((body.changes?.leads ?? []).map((x) => x.id)), sales: new Set((body.changes?.sales ?? []).map((x) => x.id)) };
          const dropped = (key: keyof Created) => new Set(created[key].filter((id) => !confirmed[key].has(id)));
          const dv = dropped("vehicles"), dl = dropped("leads"), ds = dropped("sales");
          const cleaned: WorkspaceState = body.state.partial ? { ...merged, vehicles: merged.vehicles.filter((x) => !dv.has(x.id)), leads: merged.leads.filter((x) => !dl.has(x.id)), sales: merged.sales.filter((x) => !ds.has(x.id)) } : merged;
          stateRef.current = cleaned; setState(cleaned);
          setEpoch((n) => n + 1);
        }
        if (body?.ok && body.effects) window.dispatchEvent(new CustomEvent("vl:effects", { detail: body.effects }));
        if (!body?.ok) window.dispatchEvent(new CustomEvent("vl:sync-error", { detail: { message: body?.error?.message ?? "The change could not be saved. It has been undone." } }));
      } catch {
        window.dispatchEvent(new CustomEvent("vl:sync-error", { detail: { message: "We could not reach the server. Your last change was not saved." } }));
        // Nothing was saved, so records this device created optimistically are removed again.
        const cur = stateRef.current;
        const gone = { vehicles: new Set(created.vehicles), leads: new Set(created.leads), sales: new Set(created.sales) };
        const undone: WorkspaceState = { ...cur, vehicles: cur.vehicles.filter((x) => !gone.vehicles.has(x.id)), leads: cur.leads.filter((x) => !gone.leads.has(x.id)), sales: cur.sales.filter((x) => !gone.sales.has(x.id)) };
        stateRef.current = undone; setState(undone);
        void refresh();
      } finally {
        pending.current -= 1;
        if (pending.current === 0) setSaving(false);
      }
    });
  }, [router, refresh]);

  const run = useCallback(<R extends Result<object>>(fn: (state: WorkspaceState, actor: Actor) => R): R => {
    const before = stateRef.current;
    const { value: result, commands } = recordCommands(() => fn(before, actor));
    if (result.ok) {
      stateRef.current = result.state;
      setState(result.state);
      const fresh = <T extends { id: string }>(a: T[], b: T[]) => { const known = new Set(b.map((x) => x.id)); return a.filter((x) => !known.has(x.id)).map((x) => x.id); };
      if (commands.length && demoRef.current === "normal") send(commands, { vehicles: fresh(result.state.vehicles, before.vehicles), leads: fresh(result.state.leads, before.leads), sales: fresh(result.state.sales, before.sales) });
    }
    return result;
  }, [actor, send]);

  const runAsync = useCallback(async <R extends Result<object>>(fn: (state: WorkspaceState, actor: Actor) => Promise<R>): Promise<R> => {
    const result = await fn(stateRef.current, actor);
    if (result.ok) { stateRef.current = result.state; setState(result.state); }
    return result;
  }, [actor]);

  const queueAck = useCallback(() => { /* provider acknowledgement is never simulated */ }, []);

  const mergeRecords = useCallback<Ctx["mergeRecords"]>((records) => {
    const cur = stateRef.current;
    const next: WorkspaceState = { ...cur, vehicles: upsert(cur.vehicles, records.vehicles ?? []), leads: upsert(cur.leads, records.leads ?? []), sales: upsert(cur.sales, records.sales ?? []), alerts: upsert(cur.alerts, records.alerts ?? []) };
    stateRef.current = next;
    setState(next);
  }, []);

  const scope = useMemo(() => resolveScope(active, session.branchIds, params.get("branch")), [active, session.branchIds, params]);
  const can = useCallback((capability: Capability) => canDo(session.role, capability), [session.role]);

  const value = useMemo<Ctx>(() => ({ state: active, session, actor, can, run, runAsync, queueAck, scope, demoState, hydrated: true, saving, refresh, mergeRecords, epoch }), [active, session, actor, can, run, runAsync, queueAck, scope, demoState, saving, refresh, mergeRecords, epoch]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function WorkspaceProvider({ session, initialState, asOf, children }: { session: Session; initialState: WorkspaceState; asOf: string; children: ReactNode }) {
  return <Suspense fallback={null}><Inner session={session} initialState={initialState} asOf={asOf}>{children}</Inner></Suspense>;
}

/** Router-backed URL state: branch, filters, sort, tab and page cursor live in the URL so back/forward restore them. */
export function useUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const get = useCallback((key: string, fallback = ""): string => params.get(key) ?? fallback, [params]);
  const set = useCallback((patch: Record<string, string | number | null | undefined>, options: { push?: boolean } = {}) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined || value === "") next.delete(key);
      else next.set(key, String(value));
    }
    const query = next.toString();
    const url = query ? `${pathname}?${query}` : pathname;
    if (options.push) router.push(url, { scroll: false }); else router.replace(url, { scroll: false });
  }, [params, pathname, router]);
  return { get, set, params, pathname };
}

/** Navigation links keep branch scope and the demo state across routes. */
export function useScopedHref() {
  const params = useSearchParams();
  const defaultBranch = defaultBranchOf(useWorkspace().state);
  return useCallback((href: string, extra: Record<string, string> = {}): string => {
    const [path, existing] = href.split("?");
    const next = new URLSearchParams(existing ?? "");
    const branch = params.get("branch");
    if (branch && branch !== defaultBranch && !next.has("branch")) next.set("branch", branch);
    const demo = params.get("demo_state");
    if (demo && !next.has("demo_state")) next.set("demo_state", demo);
    for (const [k, v] of Object.entries(extra)) next.set(k, v);
    const query = next.toString();
    return query ? `${path}?${query}` : path;
  }, [params, defaultBranch]);
}

export type { Fail };
export { ALL_BRANCHES };
