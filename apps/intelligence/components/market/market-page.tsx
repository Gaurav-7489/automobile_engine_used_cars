"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CITIES } from "@/lib/fixtures/market";
import { formatKm, formatMoney, formatShortDateTime, formatDateTime, MISSING, lakh } from "@/lib/format";
import { OPPORTUNITY_RULE_VERSION, type ListingRow } from "@/lib/market";
import { saveSearch, deleteSearch, renameSearch, toggleWatch } from "@/lib/actions";
import { downloadCsv } from "@/lib/export";
import { SNAPSHOT_AT, SNAPSHOT_ID } from "@/lib/time";
import { tierExplanation } from "@/lib/evidence";
import { Dialog, Drawer, Menu } from "../overlay";
import { Panel } from "../panel";
import { useToast } from "../toast";
import { Button, Check, EmptyState, ErrorPanel, Notice, PageHead, SelectField, TextField, Skeleton } from "../ui";
import { Icon } from "../icons";
import { useScopedHref, useUrlState, useWorkspace } from "../workspace";
import { DifferenceCell, EvidenceBadge, useListings } from "./common";

const KEYS = ["q", "yearFrom", "yearTo", "region", "priceMin", "priceMax", "fuel", "transmission", "variant", "observed", "make", "city", "kmMax", "owners", "sort"] as const;
const DEFAULTS: Record<string, string> = { q: "BMW 520d Luxury Line", yearFrom: "2018", yearTo: "2020", priceMin: "20", priceMax: "35", fuel: "Diesel", transmission: "Automatic", variant: "Luxury Line", observed: "14", sort: "opportunity" };
const SORTS = [{ value: "opportunity", label: "Evidence-adjusted opportunity" }, { value: "asking_asc", label: "Asking price: low to high" }, { value: "asking_desc", label: "Asking price: high to low" }, { value: "newest", label: "Newest observed" }, { value: "distance", label: "Distance (missing last)" }];
const FUELS = ["Diesel", "Petrol"];
const TRANSMISSIONS = ["Automatic", "Manual"];

type Filters = Record<string, string>;

/** Popover with a complete-query Apply/Cancel for multi-field filters. */
function FilterPopover({ label, summary, children, onApply, onCancel, active }: { label: string; summary: string; children: React.ReactNode; onApply: () => void; onCancel?: () => void; active?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="row-menu">
      <button type="button" className={`btn ${active ? "btn-active" : ""}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)} aria-label={`${label}: ${summary}`}>{summary}<Icon name="chevronDown" size={16} /></button>
      {open ? (
        <div className="menu left filter-pop" role="dialog" aria-label={label} onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); onCancel?.(); } }}>
          <div className="stack" style={{ padding: 12 }}>
            <strong>{label}</strong>
            {children}
            <div className="row-flex"><Button size="sm" variant="primary" onClick={() => { onApply(); setOpen(false); }}>Apply</Button><Button size="sm" onClick={() => { onCancel?.(); setOpen(false); }}>Cancel</Button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MarketPage() {
  const { state, run, can, demoState } = useWorkspace();
  const url = useUrlState();
  const href = useScopedHref();
  const toast = useToast();
  const hasAny = KEYS.some((k) => url.params.has(k)) || url.get("cleared") === "1";
  const f = useMemo<Filters>(() => {
    const base: Filters = hasAny ? {} : { ...DEFAULTS };
    for (const k of KEYS) { const v = url.get(k); if (v !== "") base[k] = v; }
    return base;
  }, [url, hasAny]);
  const cursor = Number(url.get("cursor", "0")) || 0;
  const view = url.get("view") || "";
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [quick, setQuick] = useState<ListingRow | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => { const mq = window.matchMedia("(max-width: 767px)"); const update = () => setMobile(mq.matches); update(); mq.addEventListener("change", update); return () => mq.removeEventListener("change", update); }, []);
  const effectiveView = view || (mobile ? "cards" : "table");

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    for (const k of KEYS) if (f[k]) p.set(k, f[k]);
    p.set("cursor", String(cursor));
    p.set("limit", "25");
    return p.toString();
  }, [f, cursor]);

  const feed = state.integrations.find((i) => i.id === "feed-a");
  const feedConnected = Boolean(feed && (feed.state === "Connected" || feed.state === "Degraded"));
  const listings = useListings(queryString, demoState !== "loading" && demoState !== "error" && feedConnected);
  const result = listings.data?.data;
  const rows = result?.listings ?? [];
  const total = result?.total ?? 0;

  const patch = (changes: Record<string, string | null>) => url.set({ ...changes, cursor: null, cleared: null });
  const activeChips: { key: string; label: string }[] = [];
  if (f.variant) activeChips.push({ key: "variant", label: `Variant: ${f.variant}` });
  if (f.observed) activeChips.push({ key: "observed", label: `Observed within ${f.observed} days` });
  if (f.make) activeChips.push({ key: "make", label: `Make: ${f.make}` });
  if (f.city) activeChips.push({ key: "city", label: `City: ${f.city}` });
  if (f.kmMax) activeChips.push({ key: "kmMax", label: `Up to ${Number(f.kmMax).toLocaleString("en-IN")} km` });
  if (f.owners) activeChips.push({ key: "owners", label: `Up to ${f.owners} owner${f.owners === "1" ? "" : "s"}` });
  const filterCount = [f.yearFrom || f.yearTo, f.region, f.priceMin || f.priceMax, f.fuel, f.transmission].filter(Boolean).length + activeChips.length;

  const yearSummary = f.yearFrom || f.yearTo ? `${f.yearFrom || "Any"}-${f.yearTo || "Any"}` : "Any year";
  const priceSummary = f.priceMin || f.priceMax ? `₹${f.priceMin || "0"}-${f.priceMax || "Any"} L` : "Any price";
  const [draft, setDraft] = useState({ yearFrom: f.yearFrom ?? "", yearTo: f.yearTo ?? "", priceMin: f.priceMin ?? "", priceMax: f.priceMax ?? "" });
  useEffect(() => setDraft({ yearFrom: f.yearFrom ?? "", yearTo: f.yearTo ?? "", priceMin: f.priceMin ?? "", priceMax: f.priceMax ?? "" }), [f.yearFrom, f.yearTo, f.priceMin, f.priceMax]);
  const [qDraft, setQDraft] = useState(f.q ?? "");
  useEffect(() => setQDraft(f.q ?? ""), [f.q]);

  const watching = (id: string) => state.watchlist.includes(id);
  const toggle = (id: string) => { run((s) => ({ ok: true as const, state: toggleWatch(s, id) })); toast(watching(id) ? "Removed from watchlist." : "Added to watchlist."); };

  const exportRows = () => {
    if (!can("market.export")) return;
    const lines = [["listing_id", "make", "model", "variant", "year", "km", "owners", "city", "asking_rupees", "estimate_rupees", "difference_pct", "source", "observed_at", "evidence_tier", "matched_n"],
      ...rows.filter((r) => !selectMode || !selected.length || selected.includes(r.id)).map((r) => [r.id, r.make, r.model, r.variant, String(r.year), String(r.km), String(r.owners), r.city, String(r.asking / 100), r.estimate === null ? "" : String(r.estimate / 100), r.difference === null ? "" : r.difference.toFixed(1), r.source, r.observedAt, r.tier, String(r.matched)])];
    downloadCsv(`market-listings-${SNAPSHOT_ID}.csv`, lines, [`# Source attribution: licensed feeds as named per row; asking prices, not transactions`, `# Snapshot ${SNAPSHOT_ID} / rule ${OPPORTUNITY_RULE_VERSION} / filters ${queryString}`]);
    toast("Export ready: permitted rows and source attribution only.");
  };

  const comparing = rows.filter((r) => selected.includes(r.id));
  const shown = effectiveView === "cards" ? rows : rows;
  const cursorEnd = Math.min(total, cursor + rows.length);

  return (
    <div className="page">
      <PageHead title="Market Opportunity Radar" lead="Licensed listings, visible evidence and explainable comparisons." />
      <form className="search-row" role="search" aria-label="Market search" onSubmit={(e) => { e.preventDefault(); patch({ q: qDraft.trim() || null, cleared: qDraft.trim() ? null : "1" }); }}>
        <TextField label="Search make, model or variant" className="search-q" value={qDraft} onChange={(e) => setQDraft(e.target.value)} placeholder="BMW 520d Luxury Line" enterKeyHint="search" aria-label="Search make, model or variant" />
        <Button variant="primary" type="submit">Search</Button>
        <Button onClick={() => setSavedOpen(true)}>Saved searches</Button>
        <Button onClick={() => setSaveOpen(true)}>Save search</Button>
      </form>

      <div className="filter-row" role="group" aria-label="Filters">
        <FilterPopover label="Year range" summary={yearSummary} active={Boolean(f.yearFrom || f.yearTo)} onApply={() => patch({ yearFrom: draft.yearFrom || null, yearTo: draft.yearTo || null })} onCancel={() => setDraft((d) => ({ ...d, yearFrom: f.yearFrom ?? "", yearTo: f.yearTo ?? "" }))}>
          <div className="form-grid"><TextField label="From" inputMode="numeric" value={draft.yearFrom} onChange={(e) => setDraft({ ...draft, yearFrom: e.target.value.replace(/\D/g, "") })} /><TextField label="To" inputMode="numeric" value={draft.yearTo} onChange={(e) => setDraft({ ...draft, yearTo: e.target.value.replace(/\D/g, "") })} /></div>
        </FilterPopover>
        <Menu label={`Region: ${f.region || "All regions"}`} buttonClass={`btn ${f.region ? "btn-active" : ""}`} align="left" text={<><span>{f.region || "All regions"}</span><Icon name="chevronDown" size={16} /></>}>
          {(close) => <>{["", ...CITIES.map((c) => c.region)].map((r) => <button key={r || "all"} role="menuitemradio" aria-checked={(f.region ?? "") === r} onClick={() => { patch({ region: r || null }); close(); }}>{r || "All regions"}</button>)}</>}
        </Menu>
        <FilterPopover label="Asking price (₹ lakh)" summary={priceSummary} active={Boolean(f.priceMin || f.priceMax)} onApply={() => patch({ priceMin: draft.priceMin || null, priceMax: draft.priceMax || null })} onCancel={() => setDraft((d) => ({ ...d, priceMin: f.priceMin ?? "", priceMax: f.priceMax ?? "" }))}>
          <div className="form-grid"><TextField label="Minimum (L)" inputMode="decimal" value={draft.priceMin} onChange={(e) => setDraft({ ...draft, priceMin: e.target.value })} /><TextField label="Maximum (L)" inputMode="decimal" value={draft.priceMax} onChange={(e) => setDraft({ ...draft, priceMax: e.target.value })} /></div>
        </FilterPopover>
        <Menu label={`Fuel: ${f.fuel || "Any fuel"}`} buttonClass={`btn ${f.fuel ? "btn-active" : ""}`} align="left" text={<><span>{f.fuel || "Any fuel"}</span><Icon name="chevronDown" size={16} /></>}>
          {(close) => <>{["", ...FUELS].map((r) => <button key={r || "any"} role="menuitemradio" aria-checked={(f.fuel ?? "") === r} onClick={() => { patch({ fuel: r || null }); close(); }}>{r || "Any fuel"}</button>)}</>}
        </Menu>
        <Menu label={`Transmission: ${f.transmission || "Any transmission"}`} buttonClass={`btn ${f.transmission ? "btn-active" : ""}`} align="left" text={<><span>{f.transmission || "Any transmission"}</span><Icon name="chevronDown" size={16} /></>}>
          {(close) => <>{["", ...TRANSMISSIONS].map((r) => <button key={r || "any"} role="menuitemradio" aria-checked={(f.transmission ?? "") === r} onClick={() => { patch({ transmission: r || null }); close(); }}>{r || "Any transmission"}</button>)}</>}
        </Menu>
        <Button onClick={() => setMoreOpen(true)}>More filters{activeChips.length ? ` (${activeChips.length})` : ""}</Button>
      </div>

      <div className="chip-row" aria-label="Active filters" role="group">
        {activeChips.map((c) => <span key={c.key} className={`chip ${c.key === "variant" ? "accent" : ""}`}>{c.label}<button type="button" aria-label={`Remove filter ${c.label}`} onClick={() => patch({ [c.key]: null, cleared: "1" })}><Icon name="close" size={14} /></button></span>)}
        <span className="meta" aria-live="polite">{filterCount} active filter{filterCount === 1 ? "" : "s"}</span>
        {filterCount ? <button type="button" className="link-btn" onClick={() => url.set({ q: f.q ?? null, yearFrom: null, yearTo: null, region: null, priceMin: null, priceMax: null, fuel: null, transmission: null, variant: null, observed: null, make: null, city: null, kmMax: null, owners: null, cursor: null, cleared: "1" })}>Clear all</button> : null}
        <button type="button" className="link-btn" onClick={() => { url.set({ ...Object.fromEntries(KEYS.map((k) => [k, null])), cursor: null, cleared: "1" }); setSelected([]); }}>Reset</button>
      </div>

      <div className="toolbar">
        <h2 className="h3" aria-live="polite">{listings.status === "loading" && !result ? "Searching…" : `${total} illustrative result${total === 1 ? "" : "s"}`}</h2>
        <div className="toolbar-group">
          <SelectField label="Sort" className="sort-field" value={f.sort ?? "opportunity"} onChange={(e) => patch({ sort: e.target.value === "opportunity" ? null : e.target.value })} options={SORTS} />
          <Button variant="ghost" aria-pressed={selectMode} onClick={() => { setSelectMode((v) => !v); setSelected([]); }} className="accent-text">{selectMode ? "Done selecting" : "Select"}</Button>
          <div className="seg" role="group" aria-label="View">
            <Button variant={effectiveView === "table" ? "primary" : "secondary"} aria-pressed={effectiveView === "table"} onClick={() => url.set({ view: "table" })}>Table</Button>
            <Button variant={effectiveView === "cards" ? "primary" : "secondary"} aria-pressed={effectiveView === "cards"} onClick={() => url.set({ view: "cards" })}>Cards</Button>
          </div>
          <Button onClick={exportRows} disabled={!can("market.export") || !rows.length} reason={!can("market.export") ? "Export needs Owner, Manager or Marketing access." : undefined}>Export</Button>
        </div>
      </div>

      {!feedConnected ? (
        <EmptyState title="No licensed source is connected" actions={can("settings.integrations") ? <Link href={href("/app/settings/integrations")} className="btn btn-primary">Connect licensed source</Link> : undefined}>
          Market listings come only from approved provider feeds. {can("settings.integrations") ? "Connect a licensed source to start." : "Ask an administrator to connect a licensed source."}
        </EmptyState>
      ) : demoState === "error" ? (
        <ErrorPanel title="Feed A did not respond" message={`Source-level warning: the last successful read was ${formatDateTime(feed?.lastSuccessAt)}. Results shown earlier are labelled stale. Retry re-runs the same query.`} onRetry={() => url.set({ demo_state: null })} />
      ) : (
        <Panel title="Results" rows={6}>
          {listings.status === "error" && !result ? <ErrorPanel title="Market results could not load" message={`${listings.error ?? "The feed did not respond."} Last successful read: ${formatDateTime(feed?.lastSuccessAt)}.`} onRetry={listings.retry} /> : null}
          {feed?.state === "Degraded" ? <Notice tone="warn" role="status">Feed A last succeeded {formatDateTime(feed.lastSuccessAt)}. Newer listings may be missing.</Notice> : null}
          {listings.status === "loading" && !rows.length ? <div className="stack-sm" role="status" aria-label="Loading results">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={56} />)}</div> : null}
          {listings.status !== "loading" && result && rows.length === 0 ? (
            <EmptyState title="No listings match this search" actions={<><Button onClick={() => url.set({ q: f.q ?? null, yearFrom: null, yearTo: null, region: null, priceMin: null, priceMax: null, fuel: null, transmission: null, variant: null, observed: null, make: null, city: null, kmMax: null, owners: null, cursor: null, cleared: "1" })}>Clear filters</Button><Button onClick={() => document.querySelector<HTMLInputElement>(".search-q input")?.focus()}>Modify search</Button></>}>
              {activeChips.length ? `Active filters: ${activeChips.map((c) => c.label).join(", ")}. ` : ""}Widening is never done silently. Clear a filter or change the query.
            </EmptyState>
          ) : null}
          {rows.length > 0 && effectiveView === "table" ? (
            <div className="table-wrap" style={{ opacity: listings.status === "loading" ? 0.6 : 1 }}>
              <table className="data-table" aria-label="Market listings">
                <thead><tr>
                  {selectMode ? <th className="sel"><span className="sr-only">Select</span></th> : null}
                  <th className={selectMode ? "pin-col" : ""} style={{ width: 232 }}>Vehicle / evidence</th><th className="num" style={{ width: 70 }}>Year</th><th style={{ width: 140 }}>City</th><th className="num" style={{ width: 112 }}>km</th><th className="num" style={{ width: 80 }}>Owners</th><th className="num" style={{ width: 150 }}>Asking</th><th className="num" style={{ width: 190 }}>Est. market</th><th className="num" style={{ width: 186 }}>Difference</th><th><span className="sr-only">Actions</span></th>
                </tr></thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id}>
                      {selectMode ? <td className="sel"><input type="checkbox" aria-label={`Select ${r.make} ${r.model} ${r.city}`} checked={selected.includes(r.id)} onChange={(e) => setSelected((s) => (e.target.checked ? (s.length >= 4 ? s : [...s, r.id]) : s.filter((x) => x !== r.id)))} disabled={!selected.includes(r.id) && selected.length >= 4} /></td> : null}
                      <td className={selectMode ? "pin-col" : ""}><Link className="row-title" href={href(`/app/market/${r.id}`)}>{r.make} {r.model}</Link><span className="sub">{r.variant} / {r.source.replace("Authorised feed", "Feed")}</span></td>
                      <td className="num">{r.year}</td><td>{r.city}</td><td className="num">{formatKm(r.km)}</td><td className="num">{r.owners}</td>
                      <td className="num">{formatMoney(r.asking)}</td><td className="num">{r.estimate === null ? <>{MISSING}<span className="sub">Insufficient evidence</span></> : formatMoney(r.estimate)}</td>
                      <td className="num"><DifferenceCell value={r.difference} /></td>
                      <td><Button size="sm" variant="ghost" onClick={() => setQuick(r)} aria-label={`Quick view ${r.make} ${r.model} ${r.city}`}>Quick view</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {rows.length > 0 && effectiveView === "cards" ? (
            <ul className="card-list" aria-label="Market listings">
              {shown.map((r) => (
                <li key={r.id} className="card tight listing-card">
                  {selectMode ? <Check label={`Select ${r.make} ${r.model} ${r.city}`} checked={selected.includes(r.id)} onChange={(v) => setSelected((s) => (v ? (s.length >= 4 ? s : [...s, r.id]) : s.filter((x) => x !== r.id)))} /> : null}
                  <Link href={href(`/app/market/${r.id}`)} className="h3">{r.make} {r.model} {r.variant}</Link>
                  <span className="meta">{r.city} / {r.year} / {formatKm(r.km)} km</span>
                  <span className="listing-price">{formatMoney(r.asking)} asking</span>
                  <span className="tone-accent meta">{r.estimate === null ? "Estimate unavailable: insufficient evidence" : `${formatMoney(r.estimate)} estimated market`} / <DifferenceCell value={r.difference} /></span>
                  <span className="meta">{r.tier === "Insufficient" ? "Insufficient evidence" : `${r.tier}`} / observed {formatShortDateTime(r.observedAt)}</span>
                  <div className="row-flex"><Button size="sm" onClick={() => toggle(r.id)} aria-pressed={watching(r.id)}>{watching(r.id) ? "Watching" : "Watch"}</Button><Link href={href(`/app/market/${r.id}`)} className="btn btn-sm">Open</Link><Button size="sm" variant="ghost" onClick={() => setQuick(r)}>Quick view</Button></div>
                </li>
              ))}
            </ul>
          ) : null}
          {rows.length > 0 ? (
            <div className="pager">
              <span className="meta">{cursor + 1}-{cursorEnd} of {total} / Source age and evidence in Quick view</span>
              <div className="row-flex"><Button disabled={cursor === 0} onClick={() => url.set({ cursor: Math.max(0, cursor - 25) || null }, { push: true })}>Previous</Button><Button disabled={result?.next_cursor == null} onClick={() => url.set({ cursor: result?.next_cursor }, { push: true })}>Next</Button></div>
            </div>
          ) : null}
        </Panel>
      )}
      <p className="footnote">Negative difference means below model estimate; it does not guarantee a good acquisition.</p>

      {selectMode && selected.length ? (
        <div className="compare-tray" role="region" aria-label="Compare tray">
          <strong>{selected.length} selected</strong><span className="meta">{selected.length < 2 ? "Select at least 2 to compare (max 4)." : "Compare up to 4 vehicles side by side."}</span>
          <Button variant="primary" disabled={selected.length < 2} onClick={() => setCompareOpen(true)}>Compare</Button><Button onClick={() => setSelected([])}>Clear</Button>
        </div>
      ) : null}

      <MoreFilters open={moreOpen} onClose={() => setMoreOpen(false)} f={f} onApply={(changes) => { patch(changes); setMoreOpen(false); }} />
      <SaveSearchDialog open={saveOpen} onClose={() => setSaveOpen(false)} queryString={queryString} defaultName={f.q || "Market search"} />
      <SavedSearches open={savedOpen} onClose={() => setSavedOpen(false)} />
      <CompareSheet open={compareOpen} onClose={() => setCompareOpen(false)} rows={comparing} />
      <QuickView listing={quick} onClose={() => setQuick(null)} watching={quick ? watching(quick.id) : false} onToggle={() => quick && toggle(quick.id)} />
    </div>
  );
}

function MoreFilters({ open, onClose, f, onApply }: { open: boolean; onClose: () => void; f: Filters; onApply: (changes: Record<string, string | null>) => void }) {
  const [form, setForm] = useState({ make: f.make ?? "", city: f.city ?? "", kmMax: f.kmMax ?? "", owners: f.owners ?? "", variant: f.variant ?? "", observed: f.observed ?? "" });
  useEffect(() => { if (open) setForm({ make: f.make ?? "", city: f.city ?? "", kmMax: f.kmMax ?? "", owners: f.owners ?? "", variant: f.variant ?? "", observed: f.observed ?? "" }); }, [open, f]);
  return (
    <Drawer open={open} onClose={onClose} title="More filters" description="Apply commits a complete query. Cancel keeps the current results." size="w440" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onApply({ make: form.make || null, city: form.city || null, kmMax: form.kmMax || null, owners: form.owners || null, variant: form.variant || null, observed: form.observed || null })}>Apply</Button></>}>
      <TextField label="Make" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} placeholder="BMW" />
      <TextField label="Variant" value={form.variant} onChange={(e) => setForm({ ...form, variant: e.target.value })} placeholder="Luxury Line" />
      <SelectField label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} options={CITIES.map((c) => c.city)} placeholder="Any city" />
      <TextField label="Maximum km" inputMode="numeric" value={form.kmMax} onChange={(e) => setForm({ ...form, kmMax: e.target.value.replace(/\D/g, "") })} placeholder="80000" />
      <SelectField label="Maximum owners" value={form.owners} onChange={(e) => setForm({ ...form, owners: e.target.value })} options={[{ value: "1", label: "1 owner" }, { value: "2", label: "Up to 2 owners" }, { value: "3", label: "Up to 3 owners" }]} placeholder="Any" />
      <SelectField label="Observed within" value={form.observed} onChange={(e) => setForm({ ...form, observed: e.target.value })} options={[{ value: "7", label: "7 days" }, { value: "14", label: "14 days" }, { value: "30", label: "30 days" }]} placeholder="Any time" help="Listings older than 14 days are stale in this design." />
    </Drawer>
  );
}

function SaveSearchDialog({ open, onClose, queryString, defaultName }: { open: boolean; onClose: () => void; queryString: string; defaultName: string }) {
  const { run } = useWorkspace();
  const toast = useToast();
  const [name, setName] = useState(defaultName);
  const [cadence, setCadence] = useState<"Off" | "Daily" | "Weekly">("Off");
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setName(defaultName); setError(""); } }, [open, defaultName]);
  const clean = queryString.replace(/&?(cursor|limit)=\d+/g, "").replace(/^&/, "");
  return (
    <Dialog open={open} onClose={onClose} title="Save search" description="Matching queries are deduplicated. Choose an alert cadence if you want one." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => {
      const result = run((s, a) => saveSearch(s, a, name, clean, cadence));
      if (!result.ok) { setError(result.fields?.name ?? result.message); return; }
      toast(result.deduplicated ? "An identical search already existed. It was updated." : "Search saved."); onClose();
    }}>Save</Button></>}>
      <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} error={error} data-autofocus />
      <SelectField label="Alert cadence" value={cadence} onChange={(e) => setCadence(e.target.value as typeof cadence)} options={["Off", "Daily", "Weekly"]} help="Alerts reference evidence and never change a price." />
    </Dialog>
  );
}

function SavedSearches({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, run } = useWorkspace();
  const url = useUrlState();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  return (
    <Dialog open={open} onClose={onClose} title="Saved searches" size="w640" footer={<Button onClick={onClose}>Done</Button>}>
      {state.savedSearches.length === 0 ? <EmptyState title="No saved searches yet">Use Save search to keep a query and set an alert cadence.</EmptyState> : (
        <ul className="stack" style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {state.savedSearches.map((s) => (
            <li key={s.id} className="card tight">
              {editing === s.id ? (
                <div className="stack"><TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
                  <div className="row-flex"><Button variant="primary" onClick={() => { run((st) => renameSearch(st, s.id, name, s.cadence)); setEditing(null); toast("Saved search renamed."); }}>Save</Button><Button onClick={() => setEditing(null)}>Cancel</Button></div></div>
              ) : (
                <div className="spread" style={{ flexWrap: "wrap" }}>
                  <div><strong>{s.name}</strong><div className="meta">Alerts: {s.cadence} / saved {formatShortDateTime(s.createdAt)}</div></div>
                  <div className="row-flex">
                    <Button size="sm" variant="primary" onClick={() => { onClose(); const qs = new URLSearchParams(s.query); qs.set("cleared", "1"); url.set(Object.fromEntries(qs.entries()), { push: true }); }}>Run</Button>
                    <Button size="sm" onClick={() => { setEditing(s.id); setName(s.name); }}>Rename</Button>
                    <Button size="sm" variant="danger" onClick={() => setConfirmDelete(s.id)}>Delete search</Button>
                  </div>
                </div>
              )}
              {confirmDelete === s.id ? <Notice tone="danger" role="alert"><div className="spread" style={{ flexWrap: "wrap" }}><span>Delete “{s.name}”? Its alerts stop.</span><span className="row-flex"><Button size="sm" variant="danger" onClick={() => { run((st) => deleteSearch(st, s.id)); setConfirmDelete(null); toast("Saved search deleted."); }}>Delete search</Button><Button size="sm" onClick={() => setConfirmDelete(null)}>Keep</Button></span></div></Notice> : null}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function QuickView({ listing, onClose, watching, onToggle }: { listing: ListingRow | null; onClose: () => void; watching: boolean; onToggle: () => void }) {
  const href = useScopedHref();
  if (!listing) return null;
  const rank = listing.rank;
  return (
    <Drawer open onClose={onClose} size="w440" title={`${listing.make} ${listing.model} ${listing.variant}`} description={`${listing.id} / ${listing.year} / ${listing.city}`}
      footer={<><Button onClick={onToggle} aria-pressed={watching}>{watching ? "Watching" : "Watch"}</Button><Link href={href(`/app/market/${listing.id}`)} className="btn btn-primary">Open detail</Link></>}>
      <dl className="kv">
        <div><dt>Asking price</dt><dd>{formatMoney(listing.asking)}</dd></div>
        <div><dt>Estimated market value</dt><dd>{listing.estimate === null ? `${MISSING} / insufficient evidence` : formatMoney(listing.estimate)}</dd></div>
        <div><dt>Difference</dt><dd><DifferenceCell value={listing.difference} /></dd></div>
        <div><dt>Source</dt><dd>{listing.source}</dd></div>
        <div><dt>Observed</dt><dd>{formatDateTime(listing.observedAt)}</dd></div>
        <div><dt>Evidence</dt><dd><EvidenceBadge tier={listing.tier} /></dd></div>
        <div><dt>Matched listings</dt><dd>n = {listing.matched} within {listing.freshestDays} days</dd></div>
      </dl>
      <div className="card tight"><h3 className="h3">Why this rank</h3>
        <p className="muted" style={{ marginTop: 8 }}>{rank === null ? "No opportunity rank is issued: evidence is insufficient or no estimate exists." : `Opportunity score ${rank.toFixed(2)} (${OPPORTUNITY_RULE_VERSION}). Factors: price gap to estimate, matched-comparable count (${listing.matched}), source freshness (${listing.freshestDays} days) and estimated landed costs to Kochi (${formatMoney(listing.landedAdjust)}).`}</p>
        <p className="meta mt-2">{tierExplanation[listing.tier]}</p>
      </div>
      <Button disabled reason="Source links open only with a connected licensed feed. Illustrative listings carry no source URL.">Open source listing</Button>
    </Drawer>
  );
}

function CompareSheet({ open, onClose, rows }: { open: boolean; onClose: () => void; rows: ListingRow[] }) {
  const [diffOnly, setDiffOnly] = useState(false);
  const fields: { label: string; get: (r: ListingRow) => string }[] = [
    { label: "Variant", get: (r) => `${r.model} ${r.variant}` }, { label: "Year", get: (r) => String(r.year) }, { label: "km", get: (r) => formatKm(r.km) }, { label: "Owners", get: (r) => String(r.owners) },
    { label: "Asking", get: (r) => formatMoney(r.asking) }, { label: "Estimated market", get: (r) => (r.estimate === null ? MISSING : formatMoney(r.estimate)) }, { label: "Location", get: (r) => `${r.city}, ${r.state}` },
    { label: "Evidence", get: (r) => `${r.tier} / n=${r.matched}` }, { label: "Landed scenario to Kochi (asking + transport + fees)", get: (r) => formatMoney(r.asking + r.landedAdjust) },
  ];
  const visible = fields.filter((fld) => !diffOnly || new Set(rows.map(fld.get)).size > 1);
  return (
    <Dialog open={open} onClose={onClose} size="w960" title="Compare vehicles" description="Units are retained: asking prices are listing asks, not transactions." footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <Check label="Highlight differences only" checked={diffOnly} onChange={setDiffOnly} />
      <div className="table-wrap"><table className="data-table dense"><thead><tr><th>Attribute</th>{rows.map((r) => <th key={r.id} scope="col">{r.id}<span className="sub">{r.make} {r.model}</span></th>)}</tr></thead>
        <tbody>{visible.map((fld) => <tr key={fld.label}><th scope="row" style={{ background: "none", position: "static", fontWeight: 500 }}>{fld.label}</th>{rows.map((r) => <td key={r.id}>{fld.get(r)}</td>)}</tr>)}</tbody></table></div>
    </Dialog>
  );
}

export { lakh, SNAPSHOT_AT };
