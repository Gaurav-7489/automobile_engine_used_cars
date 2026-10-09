"use client";

import type { ReactNode, PointerEvent } from "react";

// CSS properties keep pointer motion off React's render path.
export function SpotlightCard({ children }: { children: ReactNode }) {
  function move(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === "touch") return;
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--spot-x", `${event.clientX - box.left}px`);
    event.currentTarget.style.setProperty("--spot-y", `${event.clientY - box.top}px`);
  }
  return <article className="spotlight-card" onPointerMove={move}>{children}</article>;
}
