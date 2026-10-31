"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaceEpoch, useWorkspaceIdentity } from "./workspace";

export type RemoteStatus = "loading" | "refreshing" | "ready" | "error";
export type Remote<T> = { data: T | null; status: RemoteStatus; error: string; /** HTTP status of the last failed response, 0 for a network failure. */ code: number; reload: () => void };

/**
 * The last good response per signed-in member and URL, kept in this tab's memory only. Opening a page (or going back to a
 * filter) already seen shows that result at once, marked "refreshing", while the authoritative copy loads, instead of a
 * skeleton. Nothing is cached outside a workspace session, entries expire, and a signed-out session clears everything.
 */
const recent = new Map<string, { data: unknown; at: number }>();
const RECENT_MAX = 40;
const RECENT_MS = 10 * 60_000;
/** Drops every remembered result. Called on sign-out. */
export function forgetRemote(): void { recent.clear(); }
// Server rendering shares module memory between requests, so nothing is remembered or recalled there.
const browser = typeof window !== "undefined";
function recall(key: string | null): unknown {
  if (!key || !browser) return null;
  const hit = recent.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > RECENT_MS) { recent.delete(key); return null; }
  return hit.data;
}
function remember(key: string | null, data: unknown): void {
  if (!key || !browser) return;
  recent.delete(key);
  recent.set(key, { data, at: Date.now() });
  while (recent.size > RECENT_MAX) { const oldest = recent.keys().next().value; if (oldest === undefined) break; recent.delete(oldest); }
}

/**
 * Reads one page-shaped resource. Keeps the last good result on screen while a newer one loads, cancels superseded requests,
 * ignores out-of-order responses, reloads when the server's truth may have moved (`epoch`) and signs the person out cleanly
 * when the session has expired. `onData` runs once per accepted response from the server, outside rendering; a remembered
 * result is display-only (its records were merged when it first arrived), so it never overwrites newer local changes.
 */
export function useRemote<T>(url: string | null, onData?: (data: T) => void): Remote<T> {
  const router = useRouter();
  const epoch = useWorkspaceEpoch();
  const identity = useWorkspaceIdentity();
  const keyOf = (u: string | null) => (u && identity ? `${identity}|${u}` : null);
  const [state, setState] = useState<{ data: T | null; status: RemoteStatus; error: string; code: number }>(() => {
    const cached = recall(keyOf(url)) as T | null;
    return cached ? { data: cached, status: "refreshing", error: "", code: 0 } : { data: null, status: url ? "loading" : "ready", error: "", code: 0 };
  });
  const [nonce, setNonce] = useState(0);
  const latest = useRef(0);
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    if (!url) return;
    const id = ++latest.current;
    const controller = new AbortController();
    const key = identity ? `${identity}|${url}` : null;
    const cached = recall(key) as T | null;
    setState((s) => (cached ? { data: cached, status: "refreshing", error: "", code: 0 } : { ...s, status: s.data ? "refreshing" : "loading", error: "", code: 0 }));
    fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (id !== latest.current) return;
        if (response.status === 401) { forgetRemote(); router.replace("/login?reason=expired"); return; }
        const body = await response.json().catch(() => null);
        if (id !== latest.current) return;
        if (!response.ok) { setState((s) => ({ ...s, status: "error", error: body?.error?.message ?? "We could not load this. Try again.", code: response.status })); return; }
        onDataRef.current?.(body as T);
        remember(key, body);
        setState({ data: body as T, status: "ready", error: "", code: 0 });
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name === "AbortError" || id !== latest.current) return;
        setState((s) => ({ ...s, status: "error", error: "We could not reach the server. Check your connection and try again.", code: 0 }));
      });
    return () => controller.abort();
  }, [url, epoch, nonce, router, identity]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
