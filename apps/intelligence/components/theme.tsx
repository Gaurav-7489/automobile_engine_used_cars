"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";
import { LiquidSegmented } from "./motion/liquid";
import { MOTION_KEY, THEME_KEY } from "@/lib/init-scripts";

export type ThemeChoice = "system" | "light" | "dark";
const KEY = THEME_KEY;


function read(): ThemeChoice {
  try { const t = localStorage.getItem(KEY); return t === "light" || t === "dark" ? t : "system"; } catch { return "system"; }
}

/** The theme actually showing: the chosen one, or the system's when the choice is "system". */
export function resolvedTheme(): "light" | "dark" {
  const set = document.documentElement.getAttribute("data-theme");
  return set === "light" || set === "dark" ? set : matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

type Origin = { x: number; y: number };
const reducedMotion = () => document.documentElement.getAttribute("data-motion") === "reduced";

/**
 * Changes the theme with a slow, circular wash: the new theme spreads from where you pressed until it has covered the whole page.
 * It uses the browser's View Transitions; where those are missing, or motion is reduced, the theme simply switches.
 */
export function changeTheme(choice: ThemeChoice, origin?: Origin): void {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
  const from = resolvedTheme();
  if (!doc.startViewTransition || reducedMotion()) { applyTheme(choice); return; }
  const x = origin?.x ?? innerWidth / 2, y = origin?.y ?? 0;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const t = doc.startViewTransition(() => applyTheme(choice));
  void t.ready.then(() => {
    const to = resolvedTheme();
    // Going to dark shrinks the old light page away; going to light spreads the new one. Either way it ends covering everything.
    document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] }, { duration: 1100, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" });
    void from; void to;
  }).catch(() => undefined);
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", choice);
  try { if (choice === "system") localStorage.removeItem(KEY); else localStorage.setItem(KEY, choice); } catch { /* storage can be blocked; the choice then lasts for this visit only */ }
}

/** System, light or dark. The choice is per browser and is the only thing stored. */
export function ThemeSwitch({ label = "Theme" }: { label?: string }) {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  useEffect(() => { setChoice(read()); }, []);
  return <LiquidSegmented label={label} value={choice} onChange={(c) => { setChoice(c); changeTheme(c); }} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />;
}

export type MotionChoice = "full" | "reduced";
function readMotion(): MotionChoice { try { return localStorage.getItem(MOTION_KEY) === "reduced" ? "reduced" : "full"; } catch { return "full"; } }
export function applyMotion(choice: MotionChoice): void {
  const root = document.documentElement;
  if (choice === "reduced") root.setAttribute("data-motion", "reduced");
  else if (matchMedia("(prefers-reduced-motion: reduce)").matches) root.setAttribute("data-motion", "reduced");
  else root.removeAttribute("data-motion");
  try { if (choice === "reduced") localStorage.setItem(MOTION_KEY, "reduced"); else localStorage.removeItem(MOTION_KEY); } catch { /* the choice then lasts for this visit only */ }
}

/** Full or reduced motion. Reduced is also what the operating system's "reduce motion" setting selects. */
export function MotionSwitch() {
  const [choice, setChoice] = useState<MotionChoice>("full");
  useEffect(() => { setChoice(readMotion()); }, []);
  return <LiquidSegmented label="Motion" value={choice} onChange={(c) => { setChoice(c); applyMotion(c); }} options={[{ value: "full", label: "Full motion" }, { value: "reduced", label: "Reduced" }]} />;
}

/** The same choice as menu items, for use inside a role="menu" (which may only contain menu items). */
export function ThemeMenuItems({ onChoose }: { onChoose?: () => void }) {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [motion, setMotion] = useState<MotionChoice>("full");
  useEffect(() => { setChoice(read()); setMotion(readMotion()); }, []);
  return (
    <>
      {(["system", "light", "dark"] as const).map((c) => (
        <button key={c} role="menuitemradio" aria-checked={choice === c} onClick={(e) => { setChoice(c); changeTheme(c, { x: e.clientX, y: e.clientY }); onChoose?.(); }}>Theme: {c[0].toUpperCase() + c.slice(1)}</button>
      ))}
      <button role="menuitemradio" aria-checked={motion === "reduced"} onClick={() => { const next = motion === "reduced" ? "full" : "reduced"; setMotion(next); applyMotion(next); onChoose?.(); }}>Motion: {motion === "reduced" ? "Reduced" : "Full"}</button>
    </>
  );
}

/**
 * The always-visible theme button (top bar and sign-in page): one press flips between light and dark with the circular wash, starting
 * from the button. The full System / Light / Dark choice stays in the profile menu and the Theme switch.
 */
export function ThemeToggle({ className = "icon-btn" }: { className?: string }) {
  const [now, setNow] = useState<"light" | "dark">("dark");
  useEffect(() => {
    const sync = () => setNow(resolvedTheme());
    sync();
    const mq = matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", sync);
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { mq.removeEventListener("change", sync); obs.disconnect(); };
  }, []);
  const next = now === "dark" ? "light" : "dark";
  return (
    <button type="button" className={className} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`} onClick={(e) => {
      const r = e.currentTarget.getBoundingClientRect();
      changeTheme(next, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    }}>
      <Icon name={now === "dark" ? "sun" : "moon"} />
    </button>
  );
}
