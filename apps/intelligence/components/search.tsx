"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Dialog } from "./overlay";
import { Icon } from "./icons";
import { useScopedHref, useWorkspace } from "./workspace";
import { formatMoney } from "@/lib/format";
import { landedCost } from "@/lib/finance";

type Result = { id: string; group: "Vehicles" | "Market listings" | "Leads" | "Actions"; title: string; sub: string; href: string };

const GROUPS: Result["group"][] = ["Vehicles", "Market listings", "Leads", "Actions"];

/** Ctrl/Cmd+K dialog. 300 ms debounce, two-character minimum; results respect the signed-in role and branch scope. */
export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, can, scope, session } = useWorkspace();
  const router = useRouter();
  const href = useScopedHref();
  const [raw, setRaw] = useState("");
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const requestRef = useRef(0);

  useEffect(() => {
    const handle = window.setTimeout(() => setQuery(raw.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [raw]);

  useEffect(() => { if (!open) { setRaw(""); setQuery(""); setMarket([]); } }, [open]);

  useEffect(() => {
    if (query.length < 2 || !can("market.view")) { setMarket([]); return; }
    const id = ++requestRef.current;
    const controller = new AbortController();
    setSearching(true);
    fetch(`/api/market/listings?q=${encodeURIComponent(query)}&limit=25&sort=newest`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (id !== requestRef.current || !body) return;
        const rows = (body.data.listings as { id: string; make: string; model: string; variant: string; year: number; city: string; asking: number }[]).slice(0, 5);
        setMarket(rows.map((l) => ({ id: l.id, group: "Market listings" as const, title: `${l.make} ${l.model} ${l.variant} ${l.year}`, sub: `${l.id} / ${l.city} / ${formatMoney(l.asking)} asking`, href: href(`/app/market/${l.id}`) })));
      })
      .catch(() => undefined)
      .finally(() => { if (id === requestRef.current) setSearching(false); });
    return () => controller.abort();
  }, [query, can, href]);

  const results = useMemo<Result[]>(() => {
    if (query.length < 2) return [];
    const q = query.toLowerCase();
    const vehicles = can("inventory.view")
      ? state.vehicles.filter((v) => scope.ids.includes(v.branchId) && `${v.id} ${v.make} ${v.model} ${v.variant} ${v.registration}`.toLowerCase().includes(q)).slice(0, 5).map((v) => ({
          id: v.id, group: "Vehicles" as const, title: `${v.make} ${v.model} ${v.variant}`, sub: `${v.id} / ${v.year} / ${v.status === "preparation" ? "In preparation" : v.status[0].toUpperCase() + v.status.slice(1)} / landed ${formatMoney(landedCost(v.costs))}`, href: href(`/app/inventory/${v.id}`),
        }))
      : [];
    const leads = can("leads.view")
      ? state.leads.filter((l) => scope.ids.includes(l.branchId) && `${l.id} ${l.name} ${l.vehicleId ?? ""} ${l.source}`.toLowerCase().includes(q)).slice(0, 5).map((l) => ({
          id: l.id, group: "Leads" as const, title: `${l.name} / ${l.stage}`, sub: `${l.id} / ${l.vehicleId ?? "Unspecified interest"} / ${l.source}`, href: href(`/app/leads/${l.id}`),
        }))
      : [];
    const actions: Result[] = [
      ...(can("alerts.view") ? state.alerts.filter((a) => scope.ids.includes(a.branchId) && a.status !== "Resolved" && `${a.id} ${a.title} ${a.recordRef}`.toLowerCase().includes(q)).slice(0, 4).map((a) => ({ id: a.id, group: "Actions" as const, title: a.title, sub: `${a.id} / ${a.recordRef} / ${a.severity}`, href: href("/app/alerts", { alert: a.id }) })) : []),
      ...(can("inventory.edit") && "add vehicle".includes(q) ? [{ id: "add-vehicle", group: "Actions" as const, title: "Add vehicle", sub: "Open the validated inventory drawer", href: href("/app/inventory", { add: "1" }) }] : []),
      ...(can("price.view") && "price review approval".includes(q) ? [{ id: "pricing", group: "Actions" as const, title: "Pricing review queue", sub: "Evidence-led asking-price decisions", href: href("/app/pricing") }] : []),
    ];
    return [...vehicles, ...market, ...leads, ...actions];
  }, [query, state, scope.ids, can, href, market]);

  useEffect(() => setActive(0), [query, market.length]);

  const choose = (result: Result | undefined) => { if (!result) return; onClose(); router.push(result.href); };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => Math.min(results.length - 1, i + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (event.key === "Enter") { event.preventDefault(); choose(results[active]); }
  };

  let index = -1;
  return (
    <Dialog open={open} onClose={onClose} title="Search" size="w720" initialFocus="#global-search-input">
      <div onKeyDown={onKeyDown} className="stack" style={{ margin: "-4px 0" }}>
        <div className="input-affix">
          <label htmlFor="global-search-input" className="sr-only">Search vehicles, market listings, leads and actions</label>
          <input id="global-search-input" className="input" role="combobox" aria-expanded={results.length > 0} aria-controls={listId} aria-activedescendant={results[active] ? `${listId}-${active}` : undefined} autoComplete="off" placeholder="Search vehicles, market listings, leads and actions" value={raw} onChange={(e) => setRaw(e.target.value)} />
        </div>
        <div role="status" aria-live="polite" className="meta">
          {query.length === 0 ? "Type at least two characters. Use arrow keys to select, Enter to open, Escape to close." : query.length < 2 ? "Keep typing: search starts at two characters." : searching ? "Searching…" : `${results.length} result${results.length === 1 ? "" : "s"} for “${query}” in ${scope.label}, as ${session.role}`}
        </div>
        <div id={listId} role="listbox" aria-label="Search results" className="stack-sm" style={{ maxHeight: "50vh", overflow: "auto" }}>
          {GROUPS.map((group) => {
            const rows = results.filter((r) => r.group === group);
            if (!rows.length) return null;
            return (
              <div key={group} role="group" aria-label={group}>
                <div className="meta" style={{ padding: "8px 4px", fontWeight: 600 }}>{group}</div>
                {rows.map((r) => {
                  index += 1;
                  const i = index;
                  return (
                    <button key={r.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} type="button" className="menu-item-btn" onMouseEnter={() => setActive(i)} onClick={() => choose(r)}
                      style={{ display: "grid", gap: 2, width: "100%", textAlign: "left", padding: "10px 12px", minHeight: 48, borderRadius: 6, border: "1px solid transparent", background: i === active ? "var(--accent-subtle)" : "none", color: "var(--text)" }}>
                      <span style={{ fontWeight: 600 }}>{r.title}</span><span className="meta">{r.sub}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
          {query.length >= 2 && !searching && results.length === 0 ? (
            <div className="state-box"><strong>No results</strong><p className="muted">Refine your query: try a model name, a stock ID such as V-1042, or a lead ID such as L-201. Results only include records your role and branch scope can see.</p></div>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

export function SearchTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="search-trigger" onClick={onOpen} aria-label="Search vehicles, leads and actions (Ctrl or Command K)" aria-haspopup="dialog">
      <Icon name="search" size={18} /><span className="search-text">Search vehicles, leads and actions</span><span className="kbd" aria-hidden="true">/</span>
    </button>
  );
}
