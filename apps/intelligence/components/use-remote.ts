"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaceEpoch } from "./workspace";
import { cached, remember, request, store } from "@/lib/remote-cache";

export type RemoteStatus = "loading" | "refreshing" | "ready" | "error";
export type Remote<T> = { data: T | null; status: RemoteStatus; error: string; /** HTTP status of the last failed response, 0 for a network failure. */ code: number; reload: () => void;
  /** True while a fresh copy loads behind data that already matches this request (a cached revisit): refresh silently, do not dim. */ background: boolean };

/**
 * Reads one page-shaped resource. Keeps the last good result on screen while a newer one loads, cancels superseded requests,
 * ignores out-of-order responses, reloads when the server's truth may have moved (`epoch`) and signs the person out cleanly
 * when the session has expired. `onData` runs once per accepted response, outside rendering. A page opened again shows its last
 * data immediately (from lib/remote-cache) and refreshes it in the background, so navigation never waits on the network twice.
 */
export function useRemote<T>(url: string | null, onData?: (data: T) => void): Remote<T> {
  const router = useRouter();
  const pathname = usePathname();
  const epoch = useWorkspaceEpoch();
  const [state, setState] = useState<{ data: T | null; status: RemoteStatus; error: string; code: number; current: boolean }>(() => {
    const hit = url ? cached<T>(url) : undefined;
    return { data: hit?.data ?? null, status: !url ? "ready" : hit ? "refreshing" : "loading", error: "", code: 0, current: Boolean(hit) };
  });
  const [nonce, setNonce] = useState(0);
  const latest = useRef(0);
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    if (!url) return;
    const id = ++latest.current;
    let cancelled = false;
    remember(pathname, url);
    // A different URL (new filter, page or branch) shows its cached copy at once when there is one.
    const hit = cached<T>(url);
    setState((s) => hit ? { data: hit.data, status: "refreshing", error: "", code: 0, current: true } : { ...s, status: s.data ? "refreshing" : "loading", error: "", code: 0, current: false });
    request(url)
      .then(async (response) => {
        if (cancelled || id !== latest.current) return;
        if (response.status === 401) { router.replace("/login?reason=expired"); return; }
        const body = await response.json().catch(() => null);
        if (cancelled || id !== latest.current) return;
        if (!response.ok) { setState((s) => ({ ...s, status: "error", error: body?.error?.message ?? "We could not load this. Try again.", code: response.status })); return; }
        store(url, body);
        onDataRef.current?.(body as T);
        setState({ data: body as T, status: "ready", error: "", code: 0, current: true });
      })
      .catch(() => {
        if (cancelled || id !== latest.current) return;
        setState((s) => ({ ...s, status: "error", error: "We could not reach the server. Check your connection and try again.", code: 0 }));
      });
    return () => { cancelled = true; };
  }, [url, epoch, nonce, router, pathname]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const { current, ...rest } = state;
  return { ...rest, reload, background: rest.status === "refreshing" && current };
}
