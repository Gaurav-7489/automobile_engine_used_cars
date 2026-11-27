"use client";

import { useEffect } from "react";

/**
 * The motion layer: pointer position for CSS, scroll physics and a magnetic lean on primary actions. Optical response (refraction,
 * cursor reflections, squash and stretch) belongs to the Liquid Glass engine; this layer never transforms a glass surface in 3D,
 * because the lens is drawn flat on the GPU and must keep matching the element's box.
 * One passive listener per event type and a single requestAnimationFrame loop that runs only while something is moving.
 * Nothing here changes layout. It switches itself off for people who ask for reduced motion (system setting or the Motion control),
 * on touch-only devices where there is no pointer to follow, and while the tab is hidden.
 */

export const motionOff = () => typeof document !== "undefined" && document.documentElement.getAttribute("data-motion") === "reduced";

const GLASS = ".card, .kpi, .table-wrap, .state-box, .login-form";
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function MotionRoot() {
  useEffect(() => {
    const root = document.documentElement;
    const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
    let raf = 0;
    // Pointer position: target and eased value drive the ambient light and parallax.
    const p = { tx: 0.5, ty: 0.35, x: 0.5, y: 0.35 };
    // Scroll velocity eased back to rest.
    const s = { last: window.scrollY, lastT: performance.now(), v: 0, shown: 0 };
    const loop = () => {
      raf = 0;
      let moving = false;
      if (fine && !motionOff()) {
        p.x = lerp(p.x, p.tx, 0.07); p.y = lerp(p.y, p.ty, 0.07);
        if (Math.abs(p.x - p.tx) > 0.001 || Math.abs(p.y - p.ty) > 0.001) moving = true;
        root.style.setProperty("--px", p.x.toFixed(4)); root.style.setProperty("--py", p.y.toFixed(4));
      }
      // Scroll velocity for CSS (--sv). The content layer itself is never moved: GPU glass is measured against it.
      s.v *= 0.9;
      s.shown = lerp(s.shown, s.v, 0.2);
      if (Math.abs(s.shown) > 0.002 || Math.abs(s.v) > 0.002) { moving = true; root.style.setProperty("--sv", s.shown.toFixed(3)); }
      else root.style.setProperty("--sv", "0");
      if (moving) raf = requestAnimationFrame(loop);
    };
    const kick = () => { if (!raf && !document.hidden) raf = requestAnimationFrame(loop); };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || motionOff()) return;
      p.tx = e.clientX / window.innerWidth; p.ty = e.clientY / window.innerHeight;
      const target = e.target as HTMLElement | null;
      const surface = target?.closest<HTMLElement>(GLASS) ?? null;
      if (surface) {
        const r = surface.getBoundingClientRect();
        surface.style.setProperty("--mx", `${e.clientX - r.left}px`); surface.style.setProperty("--my", `${e.clientY - r.top}px`);
        surface.style.setProperty("--spot-o", "1");
      }
      // Magnetic pull on primary actions: the button leans toward the cursor and springs back.
      const magnet = target?.closest<HTMLElement>(".btn-primary") ?? null;
      if (magnet && !magnet.hasAttribute("disabled")) {
        const r = magnet.getBoundingClientRect();
        magnet.style.setProperty("--mag-x", `${((e.clientX - (r.left + r.width / 2)) / r.width * 6).toFixed(2)}px`);
        magnet.style.setProperty("--mag-y", `${((e.clientY - (r.top + r.height / 2)) / r.height * 4).toFixed(2)}px`);
      }
      kick();
    };
    const onLeave = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      t?.closest<HTMLElement>(GLASS)?.style.setProperty("--spot-o", "0");
      const m = t?.closest<HTMLElement>(".btn-primary");
      if (m) { m.style.removeProperty("--mag-x"); m.style.removeProperty("--mag-y"); }
    };
    const onScroll = () => {
      if (motionOff()) return;
      const now = performance.now(), y = window.scrollY, dt = Math.max(16, now - s.lastT);
      const v = Math.max(-1, Math.min(1, ((y - s.last) / dt) * 0.6));
      s.v = Math.abs(v) > Math.abs(s.v) ? v : s.v;
      s.last = y; s.lastT = now; kick();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onLeave, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    const vis = () => { if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; } };
    document.addEventListener("visibilitychange", vis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove); document.removeEventListener("pointerout", onLeave);
      window.removeEventListener("scroll", onScroll); document.removeEventListener("visibilitychange", vis);
    };
  }, []);
  return null;
}
