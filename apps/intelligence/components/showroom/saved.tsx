"use client";
import { useCallback, useEffect, useState } from "react";

const KEY = "vl-showroom-saved";
export const MAX_COMPARE = 3;

function read(): string[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; } catch { return []; }
}

/** Per-browser saved cars. Nothing is sent to a server. */
export function useSaved() {
  const [saved, setSaved] = useState<string[]>([]);
  useEffect(() => {
    setSaved(read());
    const sync = () => setSaved(read());
    window.addEventListener("storage", sync);
    window.addEventListener("vl-saved", sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener("vl-saved", sync); };
  }, []);
  const toggle = useCallback((slug: string) => {
    const now = read();
    const next = now.includes(slug) ? now.filter(s => s !== slug) : [...now, slug];
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable: keep in memory only */ }
    setSaved(next);
    window.dispatchEvent(new Event("vl-saved"));
  }, []);
  return { saved, toggle };
}

export function SaveButton({ slug, label }: { slug: string; label: string }) {
  const { saved, toggle } = useSaved();
  const on = saved.includes(slug);
  return (
    <button type="button" className="btn" aria-pressed={on} onClick={() => toggle(slug)}>
      {on ? "Saved" : "Save"}<span className="sr-only"> {label}</span>
    </button>
  );
}
