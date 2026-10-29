"use client";

import { useEffect } from "react";

/**
 * The motion layer: pointer light and tilt with inertia, scroll physics, magnetic and ripple press feedback.
 * One passive listener per event type and a single requestAnimationFrame loop that runs only while something is moving.
 * Nothing here changes layout. It switches itself off for people who ask for reduced motion (system setting or the Motion control),
 * on touch-only devices where there is no pointer to follow, and while the tab is hidden.
 */

export const motionOff = () => typeof document !== "undefined" && document.documentElement.getAttribute("data-motion") === "reduced";

const GLASS = ".card, .kpi, .table-wrap, .state-box, .login-form";
const PRESS = ".btn, .tab, .nav-link, .icon-btn, .avatar, .theme-switch button, .liquid-seg button, .bottom-nav a, .bottom-nav button, .menu button, .menu a";
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function MotionRoot() {
  useEffect(() => {
    const root = document.documentElement;
    const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
    let raf = 0;
    // Pointer position: target and eased value drive the ambient light and parallax.
    const p = { tx: 0.5, ty: 0.35, x: 0.5, y: 0.35 };
    // Scroll velocity eased back to rest: the page leans into the scroll and settles.
    const s = { last: window.scrollY, lastT: performance.now(), v: 0, shown: 0, el: null as HTMLElement | null };
    // Tilt and magnet targets: the element under the pointer eases toward its target and springs back on leave.
    const tilt = new Map<HTMLElement, { rx: number; ry: number; tx: number; ty: number; tz: number; mx: number; my: number }>();
    let active: HTMLElement | null = null;

    // Adaptive glass: if frames are slow while things move, drop blur for the rest of the session. Software rendering and weak GPUs land here.
    const frames: number[] = [];
    let lastFrame = 0;
    const watch = (t: number) => {
      if (root.getAttribute("data-glass") === "lite") return;
      if (lastFrame && t - lastFrame < 250) frames.push(t - lastFrame);
      lastFrame = t;
      if (frames.length >= 45) {
        const sorted = [...frames].sort((a, b) => a - b);
        if (sorted[Math.floor(sorted.length / 2)] > 28) { root.setAttribute("data-glass", "lite"); try { sessionStorage.setItem("vl-glass", "lite"); } catch { /* per-visit only */ } }
        frames.length = 0;
      }
    };
    try { if (sessionStorage.getItem("vl-glass") === "lite") root.setAttribute("data-glass", "lite"); } catch { /* ignore */ }

    const loop = (t = performance.now()) => {
      raf = 0;
      watch(t);
      let moving = false;
      if (fine && !motionOff()) {
        p.x = lerp(p.x, p.tx, 0.07); p.y = lerp(p.y, p.ty, 0.07);
        if (Math.abs(p.x - p.tx) > 0.001 || Math.abs(p.y - p.ty) > 0.001) moving = true;
        root.style.setProperty("--px", p.x.toFixed(4)); root.style.setProperty("--py", p.y.toFixed(4));
      }
      // Scroll physics: velocity decays like friction; the content layer follows it by a few pixels.
      s.v *= 0.9;
      s.shown = lerp(s.shown, s.v, 0.2);
      if (Math.abs(s.shown) > 0.002 || Math.abs(s.v) > 0.002) {
        moving = true;
        const el = s.el ?? (s.el = document.querySelector<HTMLElement>(".main-inner"));
        if (el && !motionOff()) el.style.transform = `translate3d(0, ${(-s.shown * 5).toFixed(2)}px, 0)`;
        root.style.setProperty("--sv", s.shown.toFixed(3));
      } else if (s.el && s.el.style.transform) { s.el.style.transform = ""; root.style.setProperty("--sv", "0"); }
      for (const [el, st] of tilt) {
        const goal = el === active ? 1 : 0;
        st.rx = lerp(st.rx, goal * st.tx, 0.14); st.ry = lerp(st.ry, goal * st.ty, 0.14); st.mx = lerp(st.mx, goal * st.tz, 0.14);
        const settled = goal === 0 && Math.abs(st.rx) < 0.02 && Math.abs(st.ry) < 0.02 && Math.abs(st.mx) < 0.02;
        if (settled) { el.style.transform = ""; el.style.willChange = ""; tilt.delete(el); continue; }
        moving = true;
        el.style.transform = `perspective(900px) rotateX(${st.rx.toFixed(2)}deg) rotateY(${st.ry.toFixed(2)}deg) translate3d(0, ${(-st.mx * 2).toFixed(2)}px, 0)`;
      }
      if (moving) raf = requestAnimationFrame(loop); else lastFrame = 0;
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
      // Tilt only the metric tiles (small, discrete targets); big surfaces would feel unstable.
      const tile = target?.closest<HTMLElement>(".kpi") ?? null;
      if (tile !== active) { if (active) active.style.setProperty("--spot-o", "0"); active = tile; }
      if (tile) {
        const r = tile.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
        const st = tilt.get(tile) ?? { rx: 0, ry: 0, tx: 0, ty: 0, tz: 0, mx: 0, my: 0 };
        st.tx = -ny * 5; st.ty = nx * 6; st.tz = 1; tilt.set(tile, st); tile.style.willChange = "transform";
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
      if (t?.closest(".kpi") === active) { active = null; kick(); }
    };
    const onScroll = () => {
      if (motionOff()) return;
      const now = performance.now(), y = window.scrollY, dt = Math.max(16, now - s.lastT);
      const v = Math.max(-1, Math.min(1, ((y - s.last) / dt) * 0.6));
      s.v = Math.abs(v) > Math.abs(s.v) ? v : s.v;
      s.last = y; s.lastT = now; kick();
    };
    // Press feedback: a ripple from the touch point, on every kind of control.
    const onDown = (e: PointerEvent) => {
      if (motionOff() || e.button !== 0) return;
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(PRESS);
      if (!el || el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") return;
      const r = el.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2;
      const dot = document.createElement("span");
      dot.className = "ripple"; dot.setAttribute("aria-hidden", "true");
      dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
      if (getComputedStyle(el).position === "static") el.style.position = "relative";
      el.classList.add("has-ripple");
      el.appendChild(dot);
      dot.addEventListener("animationend", () => dot.remove(), { once: true });
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onLeave, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("pointerdown", onDown, { passive: true });
    const vis = () => { if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; } };
    document.addEventListener("visibilitychange", vis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove); document.removeEventListener("pointerout", onLeave);
      window.removeEventListener("scroll", onScroll); document.removeEventListener("pointerdown", onDown); document.removeEventListener("visibilitychange", vis);
    };
  }, []);
  return null;
}
