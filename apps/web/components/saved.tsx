"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** Saved cars live only in this browser, scoped to the dealership; nothing is sent to a server. */
const limit = 30;
type SavedState = { ids: string[]; ready: boolean; toggle: (id: string) => void; clear: () => void; notice: string };
const Context = createContext<SavedState | null>(null);

export function SavedProvider({ catalog, scope, children }: { catalog: { id: string }[]; scope: string; children: ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  const [readyKey, setReadyKey] = useState("");
  const [notice, setNotice] = useState("");
  const key = `vandlabs:saved:v1:${scope}`;
  const known = useMemo(() => new Set(catalog.map(item => item.id)), [catalog]);
  const ready = readyKey === key;
  useEffect(() => {
    const restore = () => {
      try {
        const raw: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
        setIds(Array.isArray(raw) ? [...new Set(raw.filter((id): id is string => typeof id === "string" && known.has(id)))].slice(0, limit) : []);
      } catch { setIds([]); }
    };
    restore(); setReadyKey(key);
    const sync = (event: StorageEvent) => { if (event.key === key || event.key === null) restore(); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key, known]);
  useEffect(() => { if (ready) { try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* Saving still works for this visit. */ } } }, [ids, ready, key]);
  const toggle = useCallback((id: string) => {
    if (!ready || !known.has(id)) return;
    if (ids.includes(id)) { setIds(ids.filter(item => item !== id)); setNotice("Removed from saved cars."); return; }
    if (ids.length >= limit) { setNotice(`You can save up to ${limit} cars. Remove one to save another.`); return; }
    setIds([id, ...ids]); setNotice("Saved. Find it any time under Saved cars.");
  }, [ready, known, ids]);
  const clear = useCallback(() => { setIds([]); setNotice("Saved cars cleared."); }, []);
  const value = useMemo(() => ({ ids, ready, toggle, clear, notice }), [ids, ready, toggle, clear, notice]);
  return <Context.Provider value={value}>{children}<p className="sr-only" role="status">{notice}</p></Context.Provider>;
}

export function useSaved() {
  const value = useContext(Context);
  if (!value) throw new Error("Saved cars provider is required.");
  return value;
}

export function HeartIcon({ filled }: { filled: boolean }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3z" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>;
}

export function SaveButton({ id, name, className = "save-button", showLabel = false }: { id: string; name: string; className?: string; showLabel?: boolean }) {
  const { ids, toggle, ready } = useSaved();
  const saved = ids.includes(id);
  return <button type="button" className={className} aria-pressed={saved} disabled={!ready} onClick={() => toggle(id)} aria-label={saved ? `Remove ${name} from saved cars` : `Save ${name}`}>
    <HeartIcon filled={saved} />{showLabel && <span>{saved ? "Saved" : "Save"}</span>}
  </button>;
}
