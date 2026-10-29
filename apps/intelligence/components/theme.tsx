"use client";

import { useEffect, useState } from "react";
import { LiquidSegmented } from "./motion/liquid";
import { MOTION_KEY, THEME_KEY } from "@/lib/init-scripts";

export type ThemeChoice = "system" | "light" | "dark";
const KEY = THEME_KEY;


function read(): ThemeChoice {
  try { const t = localStorage.getItem(KEY); return t === "light" || t === "dark" ? t : "system"; } catch { return "system"; }
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
  return <LiquidSegmented label={label} value={choice} onChange={(c) => { setChoice(c); applyTheme(c); }} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />;
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
        <button key={c} role="menuitemradio" aria-checked={choice === c} onClick={() => { setChoice(c); applyTheme(c); onChoose?.(); }}>Theme: {c[0].toUpperCase() + c.slice(1)}</button>
      ))}
      <button role="menuitemradio" aria-checked={motion === "reduced"} onClick={() => { const next = motion === "reduced" ? "full" : "reduced"; setMotion(next); applyMotion(next); onChoose?.(); }}>Motion: {motion === "reduced" ? "Reduced" : "Full"}</button>
    </>
  );
}
