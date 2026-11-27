"use client";

import { forwardRef, useLayoutEffect, useRef, useState, type HTMLAttributes, type RefObject } from "react";
import type { MaterialName } from "@/lib/liquid-glass/tokens";

/**
 * Explicit Liquid Glass for components that are not covered by a shared class. The registry (lib/liquid-glass/registry.ts)
 * picks up data-glass, so this stays a plain element: content inside is ordinary DOM, crisp, selectable and accessible.
 */
type GlassProps = HTMLAttributes<HTMLDivElement> & { material?: MaterialName };

export const Glass = forwardRef<HTMLDivElement, GlassProps>(function Glass({ material = "standard", ...rest }, ref) {
  return <div ref={ref} data-glass={material} {...rest} />;
});

type Box = { left: number; top: number; width: number; height: number };

/**
 * A glass droplet that marks the selected item of a group (sidebar, section tabs, tab bar). The DOM marker jumps to the selection;
 * the engine follows it with springs, so the glass travels, stretches along its path and settles with a small overshoot.
 * `host` must be the positioned container of the items.
 */
export function GlassIndicator({ host, selector, deps }: { host: RefObject<HTMLElement | null>; selector: string; deps: unknown[] }) {
  const [box, setBox] = useState<Box | null>(null);
  const last = useRef<string>("");
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () => {
      const active = el.querySelector<HTMLElement>(selector);
      if (!active || active.offsetParent === null) { if (last.current) { last.current = ""; setBox(null); } return; }
      const hr = el.getBoundingClientRect(), ar = active.getBoundingClientRect();
      const next = { left: ar.left - hr.left + el.scrollLeft, top: ar.top - hr.top + el.scrollTop, width: ar.width, height: ar.height };
      const key = `${next.left}|${next.top}|${next.width}|${next.height}`;
      if (key !== last.current) { last.current = key; setBox(next); }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  if (!box) return null;
  return <span className="lg-indicator" aria-hidden="true" style={box} />;
}
