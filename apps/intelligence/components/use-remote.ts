"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspaceEpoch } from "./workspace";

export type RemoteStatus = "loading" | "refreshing" | "ready" | "error";
export type Remote<T> = { data: T | null; status: RemoteStatus; error: string; /** HTTP status of the last failed response, 0 for a network failure. */ code: number; reload: () => void };

/**
 * Reads one page-shaped resource. Keeps the last good result on screen while a newer one loads, cancels superseded requests,
 * ignores out-of-order responses, reloads when the server's truth may have moved (`epoch`) and signs the person out cleanly
 * when the session has expired. `onData` runs once per accepted response, outside rendering.
 */
export function useRemote<T>(url: string | null, onData?: (data: T) => void): Remote<T> {
  const router = useRouter();
  const epoch = useWorkspaceEpoch();
  const [state, setState] = useState<{ data: T | null; status: RemoteStatus; error: string; code: number }>({ data: null, status: url ? "loading" : "ready", error: "", code: 0 });
  const [nonce, setNonce] = useState(0);
  const latest = useRef(0);
  const onDataRef = useRef(onData);
  onDataRef.current = onData;

  useEffect(() => {
    if (!url) return;
    const id = ++latest.current;
    const controller = new AbortController();
    setState((s) => ({ ...s, status: s.data ? "refreshing" : "loading", error: "", code: 0 }));
    fetch(url, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (id !== latest.current) return;
        if (response.status === 401) { router.replace("/login?reason=expired"); return; }
        const body = await response.json().catch(() => null);
        if (id !== latest.current) return;
        if (!response.ok) { setState((s) => ({ ...s, status: "error", error: body?.error?.message ?? "We could not load this. Try again.", code: response.status })); return; }
        onDataRef.current?.(body as T);
        setState({ data: body as T, status: "ready", error: "", code: 0 });
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name === "AbortError" || id !== latest.current) return;
        setState((s) => ({ ...s, status: "error", error: "We could not reach the server. Check your connection and try again.", code: 0 }));
      });
    return () => controller.abort();
  }, [url, epoch, nonce, router]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
