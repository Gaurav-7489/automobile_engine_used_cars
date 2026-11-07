"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Navigation feedback. The moment an internal link is followed a thin liquid bar starts; if the next page takes longer than a
 * moment, a glass veil covers the content area (not the whole screen, so the rail and top bar stay usable) until the new page is in.
 */
export function RouteLoader() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<"idle" | "bar" | "veil">("idle");
  const timers = useRef<number[]>([]);
  const pending = useRef<HTMLElement | null>(null);
  // The link that was followed is marked at once (data-pending), so the tap is visibly acknowledged before the page changes.
  const release = useCallback(() => { pending.current?.removeAttribute("data-pending"); pending.current = null; }, []);
  const clear = useCallback(() => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; release(); }, [release]);

  useEffect(() => { clear(); setPhase("idle"); }, [pathname, clear]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // Runs in the capture phase: Next's <Link> cancels the native click (it navigates itself), so a bubbling listener would
      // see every in-app link as "prevented" and never show feedback. Links that are switched off are skipped instead.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.getAttribute("aria-disabled") === "true") return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      clear(); setPhase("bar");
      a.setAttribute("data-pending", "true"); pending.current = a;
      timers.current.push(window.setTimeout(() => setPhase("veil"), 220));
      // Never leave a loader up: if navigation stalls or is cancelled, release it.
      timers.current.push(window.setTimeout(() => { release(); setPhase("idle"); }, 15_000));
    };
    document.addEventListener("click", onClick, true);
    return () => { document.removeEventListener("click", onClick, true); clear(); };
  }, [clear, release]);

  if (phase === "idle") return null;
  return (
    <>
      <div className="route-bar" aria-hidden="true"><i /></div>
      {phase === "veil" ? (
        <div className="route-veil" role="status" aria-live="polite">
          <div className="route-veil-card"><span className="liquid-orb" aria-hidden="true" /><span>Loading</span></div>
        </div>
      ) : null}
    </>
  );
}
