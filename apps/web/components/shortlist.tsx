"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { Vehicle } from "@vandlabs/contracts";

export type ShortlistVehicle = Pick<Vehicle, "id" | "slug" | "make" | "model" | "year" | "price" | "availabilityStatus">;
type ShortlistState = { ids: string[]; ready: boolean; catalog: ShortlistVehicle[]; setIds: (ids: string[]) => void; toggle: (id: string) => void };
const Context = createContext<ShortlistState | null>(null);

export function ShortlistProvider({ catalog, scope, children }: { catalog: ShortlistVehicle[]; scope: string; children: ReactNode }) {
  const [ids, updateIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const storageKey = `vandlabs:shortlist:v1:${scope}`;
  useEffect(() => {
    const sanitize = (raw: unknown) => Array.isArray(raw) ? [...new Set(raw.filter((id): id is string => typeof id === "string" && catalog.some(v => v.id === id)))].slice(0, 3) : [];
    const restore = () => { try { updateIds(sanitize(JSON.parse(localStorage.getItem(storageKey) ?? "[]"))); } catch { updateIds([]); } };
    restore(); setReady(true);
    const sync = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) restore(); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [storageKey, catalog]);
  useEffect(() => { if (ready) { try { localStorage.setItem(storageKey, JSON.stringify(ids)); } catch { /* Shortlist still works for this visit. */ } } }, [ids, ready, storageKey]);
  const setIds = useCallback((next: string[]) => {
    updateIds([...new Set(next.filter(id => catalog.some(v => v.id === id)))].slice(0, 3));
    setNotice("");
  }, [catalog]);
  const toggle = useCallback((id: string) => {
    if (!ready) return;
    if (ids.includes(id)) { setIds(ids.filter(item => item !== id)); return; }
    if (ids.length === 3) { setNotice("Your comparison has three cars. Remove one to add another."); return; }
    setIds([...ids, id]);
  }, [ready, ids, setIds]);
  const value = useMemo(() => ({ ids, ready, catalog, setIds, toggle }), [ids, ready, catalog, setIds, toggle]);
  return <Context.Provider value={value}>{children}<p className="sr-only" role="status">{notice}</p><ShortlistTray notice={notice} /></Context.Provider>;
}
export function useShortlist() { const value = useContext(Context); if (!value) throw new Error("Shortlist provider is required."); return value; }
export function ShortlistButton({ id, compact = false }: { id: string; compact?: boolean }) {
  const { ids, toggle, ready } = useShortlist();
  const selected = ids.includes(id);
  return <button type="button" className={`compare-toggle ${compact ? "compact" : ""} ${selected ? "selected" : ""}`} aria-pressed={selected} disabled={!ready} onClick={() => toggle(id)}>{selected ? "Selected for compare" : "Add to compare"}<span aria-hidden="true">{selected ? "✓" : "+"}</span></button>;
}
function ShortlistTray({ notice }: { notice: string }) {
  const { ids, catalog, setIds } = useShortlist();
  const pathname = usePathname();
  if (!ids.length || pathname === "/compare") return null;
  return <aside className="shortlist-tray" aria-label="Your shortlist"><div className="shortlist-tray-copy"><strong>{ids.length} / 3 in your shortlist</strong><span>{notice || ids.map(id => { const v = catalog.find(item => item.id === id); return v ? `${v.make} ${v.model}` : ""; }).join(" · ")}</span></div><button className="text-button" type="button" onClick={() => setIds([])}>Clear</button><Link className="button primary compact" href={`/compare?ids=${ids.join(",")}`}>Compare {ids.length} selected <span aria-hidden="true">↗</span></Link></aside>;
}
