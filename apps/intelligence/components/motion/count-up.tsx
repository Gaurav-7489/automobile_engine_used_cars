"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const NUMBER = /\d[\d,]*(\.\d+)?/;

function reducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return document.documentElement.getAttribute("data-motion") === "reduced" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Counts the number inside a figure up from zero the first time it scrolls into view ("₹46.6 L", "6", "1,290"), keeping its
 * prefix, suffix, decimals and Indian digit grouping. Screen readers get the final value only. Anything that is not a plain
 * string with a number, and everyone who prefers reduced motion, gets the value as is.
 */
export function CountUp({ value }: { value: ReactNode }) {
  const text = typeof value === "string" || typeof value === "number" ? String(value) : null;
  const match = text ? NUMBER.exec(text) : null;
  const [shown, setShown] = useState<string | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!text || !match || reducedMotion() || !ref.current) return;
    const raw = match[0];
    const target = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(target) || target === 0) return;
    const decimals = match[1] ? match[1].length - 1 : 0;
    const grouped = raw.includes(",");
    const format = (n: number) => (grouped ? n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : n.toFixed(decimals));
    const before = text.slice(0, match.index), after = text.slice(match.index + raw.length);
    let frame = 0;
    const run = () => {
      const start = performance.now(), duration = 700;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        setShown(`${before}${format(target * eased)}${after}`);
        if (t < 1) frame = requestAnimationFrame(tick); else setShown(null);
      };
      frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { observer.disconnect(); run(); } }, { threshold: 0.4 });
    observer.observe(ref.current);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!text || !match) return <>{value}</>;
  return (
    <span ref={ref}>
      <span aria-hidden="true">{shown ?? text}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
