"use client";

import { useEffect, useRef } from "react";

/**
 * The single Liquid Glass stage for the whole application, rendered once by the root layout so it survives every navigation.
 * The engine is downloaded after hydration (idle time), so it never delays the first paint; until it draws its first frame the
 * page shows the coordinated solid materials. Nothing here re-renders: the engine works outside React.
 */
export function LiquidGlassRoot() {
  const stage = useRef<HTMLDivElement>(null);
  const mirrors = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let dispose: (() => void) | null = null;
    let cancelled = false;
    const start = () => {
      void import("@/lib/liquid-glass/boot").then(({ bootLiquidGlass }) => {
        if (cancelled || !stage.current || !mirrors.current) return;
        dispose = bootLiquidGlass({ stage: stage.current, mirrors: mirrors.current });
      });
    };
    // Settings > Appearance > Glass restarts the engine with the new choice.
    const restart = () => { dispose?.(); dispose = null; start(); };
    window.addEventListener("vl:glass-choice", restart);
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };
    const handle = w.requestIdleCallback ? w.requestIdleCallback(start, { timeout: 500 }) : window.setTimeout(start, 60);
    return () => {
      cancelled = true;
      window.removeEventListener("vl:glass-choice", restart);
      if (w.cancelIdleCallback) w.cancelIdleCallback(handle); else window.clearTimeout(handle);
      dispose?.();
    };
  }, []);
  return (
    <>
      <div ref={stage} className="lg-stage" aria-hidden="true" />
      <div ref={mirrors} className="lg-mirrors" aria-hidden="true" />
    </>
  );
}
