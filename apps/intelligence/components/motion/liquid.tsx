"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * The liquid indicator: a pill that slides to the selected option, stretching as it travels and settling with a small overshoot.
 * It is decoration behind the real controls (aria-hidden); selection, keyboard and labels stay on the buttons themselves.
 */
export function useLiquid(selector: string, deps: unknown[]) {
  const host = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; width: number; top: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () => {
      const active = el.querySelector<HTMLElement>(selector);
      if (!active) return;
      setBox({ left: active.offsetLeft, width: active.offsetWidth, top: active.offsetTop, height: active.offsetHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { host, box };
}

export function Liquid({ box }: { box: { left: number; width: number; top: number; height: number } | null }) {
  if (!box) return null;
  return <span className="liquid-pill" aria-hidden="true" style={{ left: box.left, width: box.width, top: box.top, height: box.height }} />;
}

/** A segmented control with the liquid indicator. Used for short, always-visible choices (theme, motion). */
export function LiquidSegmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  const { host, box } = useLiquid('[aria-pressed="true"]', [value]);
  return (
    <div role="group" aria-label={label} className="liquid-seg" ref={host}>
      <Liquid box={box} />
      {options.map((o) => <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

/**
 * A pill with a trailing droplet: two shapes that move at different speeds inside a "goo" filter, so they stretch apart and merge back
 * like fluid. Only the shapes are filtered (never text), and the real links above them carry all meaning.
 */
export function LiquidTrail({ box }: { box: { left: number; width: number; top: number; height: number } | null }) {
  if (!box) return null;
  const at = { left: box.left, width: box.width, top: box.top, height: box.height };
  return (
    <span className="goo-trail" aria-hidden="true">
      <span className="liquid-pill lead" style={at} />
      <span className="liquid-pill trail" style={at} />
    </span>
  );
}
