"use client";

import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@/lib/domain";
import { ALL_BRANCHES, DEFAULT_BRANCH } from "@/lib/fixtures/branches";
import { can as canDo, type Capability } from "@/lib/permissions";
import { resolveScope } from "@/lib/selectors";
import { buildEmptySeed, buildSeed, STATE_VERSION, type WorkspaceState } from "@/lib/state";
import { acknowledgePlatform, reopenExpired, type Actor, type Fail, type Result } from "@/lib/actions";

const STORAGE_KEY = `vl.workspace.v${STATE_VERSION}`;

type Ctx = {
  state: WorkspaceState;
  session: Session;
  actor: Actor;
  can: (capability: Capability) => boolean;
  /** Run a domain action against the latest state. Successful results replace the state; failures are returned unchanged. */
  run: <R extends Result<object>>(fn: (state: WorkspaceState, actor: Actor) => R) => R;
  /** Same as run for actions that hash or fetch before returning (API key creation). */
  runAsync: <R extends Result<object>>(fn: (state: WorkspaceState, actor: Actor) => Promise<R>) => Promise<R>;
  queueAck: (campaignId: string) => void;
  scope: { ids: string[]; value: string; label: string };
  demoState: "normal" | "loading" | "empty" | "error" | "partial";
  hydrated: boolean;
  resetDemo: () => void;
};

const WorkspaceContext = createContext<Ctx | null>(null);

export function useWorkspace(): Ctx {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

function Inner({ session, children }: { session: Session; children: ReactNode }) {
  const params = useSearchParams();
  const demoParam = params.get("demo_state");
  const demoState = (["loading", "empty", "error", "partial"] as const).find((v) => v === demoParam) ?? "normal";
  const [normal, setNormal] = useState<WorkspaceState>(() => buildSeed());
  const [empty, setEmpty] = useState<WorkspaceState>(() => buildEmptySeed());
  const [hydrated, setHydrated] = useState(false);
  const active = demoState === "empty" ? empty : normal;
  const stateRef = useRef(active);
  stateRef.current = active;
  const demoRef = useRef(demoState);
  demoRef.current = demoState;
  const timers = useRef(new Map<string, number>());

  const actor = useMemo<Actor>(() => ({ sub: session.sub, name: session.name, role: session.role, branchIds: session.branchIds }), [session]);

  // Persisted demo adapter state. Reads and writes never throw: the page renders correctly without storage.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as WorkspaceState;
        if (parsed.version === STATE_VERSION) setNormal(parsed);
      }
    } catch { /* private window or blocked storage */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const handle = window.setTimeout(() => {
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normal)); } catch { /* ignore */ }
    }, 250);
    return () => window.clearTimeout(handle);
  }, [normal, hydrated]);

  // Snoozed alerts reopen at expiry when the condition persists.
  useEffect(() => {
    const check = () => setNormal((s) => reopenExpired(s));
    check();
    const interval = window.setInterval(check, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const map = timers.current;
    return () => { for (const handle of map.values()) window.clearTimeout(handle); };
  }, []);

  const run = useCallback(<R extends Result<object>>(fn: (state: WorkspaceState, actor: Actor) => R): R => {
    const result = fn(stateRef.current, actor);
    if (result.ok) {
      stateRef.current = result.state;
      if (demoRef.current === "empty") setEmpty(result.state); else setNormal(result.state);
    }
    return result;
  }, [actor]);

  const runAsync = useCallback(async <R extends Result<object>>(fn: (state: WorkspaceState, actor: Actor) => Promise<R>): Promise<R> => {
    const result = await fn(stateRef.current, actor);
    if (result.ok) {
      stateRef.current = result.state;
      if (demoRef.current === "empty") setEmpty(result.state); else setNormal(result.state);
    }
    return result;
  }, [actor]);

  const queueAck = useCallback((campaignId: string) => {
    const existing = timers.current.get(campaignId);
    if (existing) window.clearTimeout(existing);
    // The platform acknowledges asynchronously: status stays Publishing/Pausing until then.
    timers.current.set(campaignId, window.setTimeout(() => {
      timers.current.delete(campaignId);
      const result = acknowledgePlatform(stateRef.current, campaignId);
      if (result.ok) { stateRef.current = result.state; setNormal(result.state); }
    }, 3500));
  }, []);

  const scope = useMemo(() => resolveScope(active, session.branchIds, params.get("branch")), [active, session.branchIds, params]);
  const can = useCallback((capability: Capability) => canDo(session.role, capability), [session.role]);
  const resetDemo = useCallback(() => {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setNormal(buildSeed());
  }, []);

  const value = useMemo<Ctx>(() => ({ state: active, session, actor, can, run, runAsync, queueAck, scope, demoState, hydrated, resetDemo }), [active, session, actor, can, run, runAsync, queueAck, scope, demoState, hydrated, resetDemo]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function WorkspaceProvider({ session, children }: { session: Session; children: ReactNode }) {
  return <Suspense fallback={null}><Inner session={session}>{children}</Inner></Suspense>;
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
  return useCallback((href: string, extra: Record<string, string> = {}): string => {
    const [path, existing] = href.split("?");
    const next = new URLSearchParams(existing ?? "");
    const branch = params.get("branch");
    if (branch && branch !== DEFAULT_BRANCH && !next.has("branch")) next.set("branch", branch);
    const demo = params.get("demo_state");
    if (demo && !next.has("demo_state")) next.set("demo_state", demo);
    for (const [k, v] of Object.entries(extra)) next.set(k, v);
    const query = next.toString();
    return query ? `${path}?${query}` : path;
  }, [params]);
}

export type { Fail };
export { ALL_BRANCHES };
