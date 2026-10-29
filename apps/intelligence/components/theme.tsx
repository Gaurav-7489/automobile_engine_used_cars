"use client";

import { useEffect, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";
const KEY = "vl-theme";

/** Runs before first paint (inline in the layout) so the chosen theme never flashes the other one. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

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
  const set = (next: ThemeChoice) => { setChoice(next); applyTheme(next); };
  return (
    <div role="group" aria-label={label} className="theme-switch">
      {(["system", "light", "dark"] as const).map((c) => <button key={c} type="button" aria-pressed={choice === c} onClick={() => set(c)}>{c[0].toUpperCase() + c.slice(1)}</button>)}
    </div>
  );
}

/** The same choice as menu items, for use inside a role="menu" (which may only contain menu items). */
export function ThemeMenuItems({ onChoose }: { onChoose?: () => void }) {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  useEffect(() => { setChoice(read()); }, []);
  return (
    <>
      {(["system", "light", "dark"] as const).map((c) => (
        <button key={c} role="menuitemradio" aria-checked={choice === c} onClick={() => { setChoice(c); applyTheme(c); onChoose?.(); }}>Theme: {c[0].toUpperCase() + c.slice(1)}</button>
      ))}
    </>
  );
}
