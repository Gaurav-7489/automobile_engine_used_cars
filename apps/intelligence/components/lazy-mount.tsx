"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Renders its children only when they come near the screen. Until then it holds a placeholder of the same height, shaped like
 * the content (a title bar and a body), so nothing jumps when the real section appears. Sections already on screen render
 * straight away; without IntersectionObserver everything renders at once.
 */
export function LazyMount({ children, height = 320, className = "" }: { children: ReactNode; height?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setShown(true); return; }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setShown(true); io.disconnect(); } }, { rootMargin: "300px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  if (shown) return <>{children}</>;
  return (
    <div ref={ref} className={`card lazy-hold vl-loading ${className}`} style={{ minHeight: height }} aria-hidden="true">
      <span className="skeleton" style={{ height: 18, width: "35%" }} />
      <span className="skeleton" style={{ height: Math.max(40, height - 90) }} />
    </div>
  );
}
