"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { bulkArchive, bulkAssignBranch, importCommit, importPreview, IMPORT_COLUMNS, publishVehicles, transitionVehicle, type ImportRow, type PublishResult, type Transition } from "@/lib/actions";
import { withBase } from "@/lib/base-path";
import type { Lifecycle, Vehicle } from "@/lib/domain";
import { ageBucket, landedCost, needsPriceReview, stockAgeDays } from "@/lib/finance";
import { downloadCsv } from "@/lib/export";
import { formatKm, formatMoney, formatCount, MISSING } from "@/lib/format";
import { SNAPSHOT_AT } from "@/lib/time";
import { Dialog, Menu } from "../overlay";
import { Panel } from "../panel";
import { useToast } from "../toast";
import { Badge, Button, Check, EmptyState, FormSummary, Notice, PageHead, SelectField, Skeleton, Tabs, TextField } from "../ui";
import { Icon } from "../icons";
import { useScopedHref, useUrlState, useWorkspace } from "../workspace";
import { VehicleDrawer } from "./vehicle-drawer";

type TabKey = "all" | "available" | "reserved" | "preparation" | "sold" | "archived";
const LIFECYCLE_LABEL: Record<Lifecycle, string> = { available: "Available", reserved: "Reserved", preparation: "In preparation", sold: "Sold", archived: "Archived" };
type SortKey = "year" | "km" | "landed" | "asking" | "age";

const SAMPLE_CSV = "make,model,variant,year,fuel,transmission,km,owners,registration,acquired_on,acquisition_cost,asking\nHonda,City,VX,2020,Petrol,Automatic,32000,1,KL 07 CD 4521,2026-10-12,925000,1040000\nSkoda,Octavia,Style,2019,Diesel,Automatic,54000,1,KL 08 EF 9901,2026-10-10,1180000,1325000\n";

export function InventoryPage() {
  const { state, scope, can, demoState, run, queueAck } = useWorkspace();
  const url = useUrlState();
  const href = useScopedHref();
  const toast = useToast();
  const [drawer, setDrawer] = useState<{ open: boolean; vehicle?: Vehicle }>({ open: false });
  const [importOpen, setImportOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [transition, setTransition] = useState<Vehicle | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState<"archive" | "assign" | "publish" | null>(null);
  const [publishResults, setPublishResults] = useState<{ id: string; channels: PublishResult[] }[] | null>(null);

  const tab = (url.get("tab") || "all") as TabKey;
  const q = url.get("q");
  const make = url.get("make");
  const age = url.get("age");
  const sort = (url.get("sort") || "") as SortKey | "";
  const dir = url.get("dir") === "desc" ? "desc" : "asc";
  const size = [25, 50, 100].includes(Number(url.get("size"))) ? Number(url.get("size")) : 25;
  const page = Math.max(1, Number(url.get("page", "1")) || 1);
  const branchFilter = url.get("vbranch");
  const flag = url.get("flag");
  const [qDraft, setQDraft] = useState(q);
  useEffect(() => setQDraft(q), [q]);
  useEffect(() => { const handle = window.setTimeout(() => { if (qDraft !== q) url.set({ q: qDraft || null, page: null }); }, 350); return () => window.clearTimeout(handle); }, [qDraft]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (url.get("add") === "1" && can("inventory.edit")) { setDrawer({ open: true }); url.set({ add: null }); } if (url.get("import") === "1") { setImportOpen(true); url.set({ import: null }); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const all = useMemo(() => state.vehicles.filter((v) => scope.ids.includes(v.branchId)), [state.vehicles, scope.ids]);
  const counts = useMemo(() => {
    const unsold = all.filter((v) => v.status !== "sold" && v.status !== "archived");
    return { all: unsold.length, available: all.filter((v) => v.status === "available").length, reserved: all.filter((v) => v.status === "reserved").length, preparation: all.filter((v) => v.status === "preparation").length };
  }, [all]);
  const makes = useMemo(() => Array.from(new Set(all.map((v) => v.make))).sort(), [all]);

  const filtered = useMemo(() => {
    let rows = all.filter((v) => (tab === "all" ? v.status !== "sold" && v.status !== "archived" : v.status === tab));
    if (q) { const t = q.toLowerCase(); rows = rows.filter((v) => `${v.id} ${v.make} ${v.model} ${v.variant} ${v.registration}`.toLowerCase().includes(t)); }
    if (make) rows = rows.filter((v) => v.make === make);
    if (age) rows = rows.filter((v) => (age === ">45" ? stockAgeDays(v, SNAPSHOT_AT) > 45 : ageBucket(stockAgeDays(v, SNAPSHOT_AT)) === age));
    if (branchFilter) rows = rows.filter((v) => v.branchId === branchFilter);
    if (flag === "cost") rows = rows.filter((v) => !v.costComplete);
    if (flag === "media") rows = rows.filter((v) => !v.hasImages);
    if (flag === "review") rows = rows.filter((v) => needsPriceReview(v));
    const value: Record<SortKey, (v: Vehicle) => number> = { year: (v) => v.year, km: (v) => v.km, landed: (v) => landedCost(v.costs), asking: (v) => v.asking ?? -1, age: (v) => stockAgeDays(v, SNAPSHOT_AT) };
    if (sort) rows = [...rows].sort((a, b) => (value[sort](a) - value[sort](b)) * (dir === "desc" ? -1 : 1) || a.id.localeCompare(b.id));
    else rows = [...rows].sort((a, b) => a.id.localeCompare(b.id));
    return rows;
  }, [all, tab, q, make, age, branchFilter, flag, sort, dir]);

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(page, pages);
  const pageRows = filtered.slice((current - 1) * size, current * size);
  const activeFilters = [q && `Search “${q}”`, make && `Make ${make}`, age && `Age ${age === ">45" ? ">45 days" : `${age} days`}`, branchFilter && `Branch ${state.branches.find((b) => b.id === branchFilter)?.name}`, flag && `Flag: ${flag}`].filter(Boolean) as string[];
  const clearFilters = () => url.set({ q: null, make: null, age: null, vbranch: null, flag: null, page: null });
  const setSort = (key: SortKey) => url.set({ sort: sort === key && dir === "desc" ? null : key, dir: sort === key && dir === "asc" ? "desc" : sort === key ? null : "asc", page: null });
  const ariaSort = (key: SortKey): "ascending" | "descending" | "none" => (sort === key ? (dir === "desc" ? "descending" : "ascending") : "none");
  const toggleSel = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const pageAllSelected = pageRows.length > 0 && pageRows.every((v) => selected.includes(v.id));

  const th = (key: SortKey, label: string, width: number) => (
    <th className="num" style={{ width }} aria-sort={ariaSort(key)}><button type="button" className="sort" onClick={() => setSort(key)}>{label}<Icon name={sort === key ? (dir === "desc" ? "chevronDown" : "chevronUp") : "sort"} size={14} /><span className="sr-only">, sort {sort === key && dir === "asc" ? "descending" : "ascending"}</span></button></th>
  );

  const exportRows = (rows: Vehicle[]) => {
    downloadCsv("inventory-export.csv", [["stock_id", "make", "model", "variant", "year", "km", "landed_rupees", "asking_rupees", "age_days", "lifecycle", "price_review_flag"], ...rows.map((v) => [v.id, v.make, v.model, v.variant, String(v.year), String(v.km), String(landedCost(v.costs) / 100), v.asking === null ? "" : String(v.asking / 100), String(stockAgeDays(v, SNAPSHOT_AT)), LIFECYCLE_LABEL[v.status], needsPriceReview(v) ? "Review" : ""])], [`# Inventory export / scope ${scope.label} / snapshot ${SNAPSHOT_AT} / units: rupees`]);
    toast(`Exported ${rows.length} record(s). Registration numbers are excluded.`);
  };

  const rowMenu = (v: Vehicle) => (
    <Menu label={`Actions for ${v.id}`}>
      {(close) => (
        <>
          <Link role="menuitem" href={href(`/app/inventory/${v.id}`)} onClick={close}>Open</Link>
          {can("inventory.edit") && v.status !== "sold" && v.status !== "archived" ? <button role="menuitem" onClick={() => { setDrawer({ open: true, vehicle: v }); close(); }}>Edit</button> : null}
          {can("inventory.transition") && v.status !== "sold" && v.status !== "archived" ? <button role="menuitem" onClick={() => { setTransition(v); close(); }}>Change lifecycle state</button> : null}
          {can("price.view") && v.status === "available" ? <Link role="menuitem" href={href("/app/pricing", { vehicle: v.id })} onClick={close}>Review price</Link> : null}
          <button role="menuitem" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}${withBase(`/app/inventory/${v.id}`)}`); toast("Internal link copied."); } catch { toast("Copy failed.", "error"); } close(); }}>Copy internal link</button>
        </>
      )}
    </Menu>
  );

  const attention = (v: Vehicle) => [!v.costComplete ? "Cost incomplete" : "", !v.hasImages ? "No photo" : ""].filter(Boolean);
  const bulkTargets = all.filter((v) => selected.includes(v.id));

  return (
    <div className="page">
      <PageHead title="Inventory management" lead="One authoritative stock record, from acquisition to reconciled sale."
        actions={can("inventory.edit") ? <Button variant="primary" className="primary-cta" onClick={() => setDrawer({ open: true })}>Add vehicle</Button> : <Button variant="primary" disabled reason="Requires Owner, Manager or Inventory access.">Add vehicle</Button>} />

      <Tabs label="Lifecycle status" value={tab} onChange={(v) => url.set({ tab: v === "all" ? null : v, page: null })} idPrefix="inv"
        tabs={[{ value: "all", label: "All", count: counts.all }, { value: "available", label: "Available", count: counts.available }, { value: "reserved", label: "Reserved", count: counts.reserved }, { value: "preparation", label: "In preparation", count: counts.preparation }, { value: "sold", label: "Sold" }, { value: "archived", label: "Archived" }]} />

      <div className="inv-filters" role="group" aria-label="Filters">
        <TextField label="Search model, stock ID or registration" aria-label="Search model, stock ID or registration" value={qDraft} onChange={(e) => setQDraft(e.target.value)} placeholder="Search model, stock ID or registration" className="inv-search" enterKeyHint="search" />
        <SelectField label="Make" aria-label="Make" className="inv-make" value={make} onChange={(e) => url.set({ make: e.target.value || null, page: null })} options={makes} placeholder="All makes" />
        <SelectField label="Age" aria-label="Age" className="inv-age" value={age} onChange={(e) => url.set({ age: e.target.value || null, page: null })} options={[{ value: "0-15", label: "0-15 days" }, { value: "16-30", label: "16-30 days" }, { value: "31-45", label: "31-45 days" }, { value: ">45", label: "Over 45 days" }]} placeholder="All ages" />
        <Button onClick={() => setMoreOpen(true)}>More filters{(branchFilter ? 1 : 0) + (flag ? 1 : 0) ? ` (${(branchFilter ? 1 : 0) + (flag ? 1 : 0)})` : ""}</Button>
        <Button onClick={() => setImportOpen(true)} disabled={!can("inventory.edit")} reason={!can("inventory.edit") ? "Import needs Owner, Manager or Inventory access." : undefined}>Import CSV</Button>
      </div>
      {activeFilters.length ? <div className="chip-row"><span className="meta" aria-live="polite">{activeFilters.length} active filter{activeFilters.length > 1 ? "s" : ""}:</span>{activeFilters.map((f) => <span className="chip" key={f}>{f}</span>)}<button className="link-btn" onClick={clearFilters}>Clear all</button></div> : null}

      {selectMode && selected.length ? (
        <div className="bulk-bar card tight" role="region" aria-label="Bulk actions">
          <strong>{selected.length} selected</strong>
          <div className="row-flex">
            <Button size="sm" onClick={() => exportRows(bulkTargets)} disabled={!can("inventory.view")}>Export</Button>
            <Button size="sm" onClick={() => setBulk("assign")} disabled={!can("inventory.bulk")} reason={!can("inventory.bulk") ? "Needs bulk permission" : undefined}>Assign branch</Button>
            <Button size="sm" onClick={() => setBulk("publish")} disabled={!can("inventory.transition")}>Publish</Button>
            <Button size="sm" variant="danger" onClick={() => setBulk("archive")} disabled={!can("inventory.bulk")}>Archive</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear selection</Button>
          </div>
          <span className="meta">Price changes use the approval workflow: no direct bulk asking-price edits.</span>
        </div>
      ) : null}

      <Panel title="Inventory table" rows={8} partialFail>
        {demoState === "empty" || (all.length === 0) ? (
          <EmptyState title="No stock yet" actions={<><Button variant="primary" onClick={() => setDrawer({ open: true })} disabled={!can("inventory.edit")}>Add first vehicle</Button><Button onClick={() => setImportOpen(true)} disabled={!can("inventory.edit")}>Import CSV</Button></>}>Add your first vehicle or import stock from a spreadsheet. Totals appear once records exist.</EmptyState>
        ) : total === 0 ? (
          <EmptyState title="No vehicles match these filters" actions={<Button onClick={clearFilters}>Clear filters</Button>}>Totals for this scope are retained above: {counts.all} unsold, {counts.available} available. Clear a filter to see them.</EmptyState>
        ) : (
          <>
            <div className="table-wrap only-desktop">
              <table className="data-table" aria-label="Inventory">
                <thead><tr>
                  {selectMode ? <th className="sel"><input type="checkbox" aria-label="Select all on this page" checked={pageAllSelected} onChange={(e) => setSelected((s) => e.target.checked ? Array.from(new Set([...s, ...pageRows.map((v) => v.id)])) : s.filter((id) => !pageRows.some((v) => v.id === id)))} /></th> : null}
                  <th className="pin-col" style={{ width: 272 }}>Vehicle / stock ID</th>{th("year", "Year", 64)}{th("km", "km", 100)}{th("landed", "Landed", 140)}{th("asking", "Asking", 140)}{th("age", "Age", 80)}
                  <th style={{ width: 184 }}>Lifecycle</th><th style={{ width: 180 }}>Price review</th><th style={{ width: 56 }}><span className="sr-only">Actions</span></th>
                </tr></thead>
                <tbody>
                  {pageRows.map((v) => (
                    <tr key={v.id}>
                      {selectMode ? <td className="sel"><input type="checkbox" aria-label={`Select ${v.id}`} checked={selected.includes(v.id)} onChange={() => toggleSel(v.id)} /></td> : null}
                      <td className="pin-col"><Link href={href(`/app/inventory/${v.id}`)} className="row-title">{v.make} {v.model}</Link><span className="sub">{v.id} / {v.variant}{attention(v).length ? <> · <span className="warn-text">{attention(v).join(", ")}</span></> : null}</span></td>
                      <td className="num">{v.year}</td><td className="num">{formatKm(v.km)}</td><td className="num" title={`Landed cost incl. acquisition, transport, inspection, refurbishment, fees`}>{formatMoney(landedCost(v.costs))}</td><td className="num">{formatMoney(v.asking)}</td><td className="num">{stockAgeDays(v, SNAPSHOT_AT)}d</td>
                      <td>{LIFECYCLE_LABEL[v.status]}</td><td>{needsPriceReview(v) ? <Link className="warn-text" style={{ fontWeight: 600 }} href={href("/app/pricing", { vehicle: v.id })}>Review</Link> : MISSING}</td><td>{rowMenu(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="card-list only-mobile" aria-label="Inventory">
              {pageRows.map((v) => (
                <li key={v.id} className="card tight listing-card">
                  {selectMode ? <Check label={`Select ${v.id}`} checked={selected.includes(v.id)} onChange={() => toggleSel(v.id)} /> : null}
                  <Link href={href(`/app/inventory/${v.id}`)} className="h3">{v.model} / {v.id}</Link>
                  <span className="meta">{formatMoney(v.asking)} asking / {formatMoney(landedCost(v.costs))} landed</span>
                  <span className={needsPriceReview(v) || attention(v).length ? "warn-text meta" : "tone-accent meta"}>{LIFECYCLE_LABEL[v.status]} / {stockAgeDays(v, SNAPSHOT_AT)}d{needsPriceReview(v) ? " / Price review" : ""}{attention(v).length ? ` / ${attention(v).join(", ")}` : ""}</span>
                  <div className="row-flex">{rowMenu(v)}</div>
                </li>
              ))}
            </ul>
            <div className="pager">
              <div className="row-flex"><span className="meta">{(current - 1) * size + 1}-{Math.min(total, current * size)} of {total}</span>
                <button className="link-btn" onClick={() => { setSelectMode((v) => !v); if (selectMode) setSelected([]); }} aria-pressed={selectMode}>{selectMode ? "Done selecting" : "Select vehicles / bulk actions"}</button>
                {selectMode && selected.length ? <span className="meta">{selected.length} selected across pages</span> : null}
              </div>
              <div className="row-flex">
                <label className="sr-only" htmlFor="page-size">Rows per page</label>
                <select id="page-size" className="select" style={{ width: 96, minHeight: 44 }} value={size} onChange={(e) => url.set({ size: e.target.value === "25" ? null : e.target.value, page: null })}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select>
                <Button disabled={current <= 1} onClick={() => url.set({ page: current - 1 === 1 ? null : current - 1 }, { push: true })}>Previous</Button>
                <Button disabled={current >= pages} onClick={() => url.set({ page: current + 1 }, { push: true })}>Next</Button>
              </div>
            </div>
          </>
        )}
      </Panel>
      <p className="footnote">Price review is a flag. Available / Reserved / In preparation / Sold / Archived are lifecycle states.</p>

      <VehicleDrawer key={`${drawer.open}-${drawer.vehicle?.id}-${drawer.vehicle?.version}`} open={drawer.open} onClose={() => setDrawer({ open: false })} vehicle={drawer.vehicle} defaultBranch={scope.ids[0] ?? "koc"} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} branchId={scope.ids[0] ?? ""} />
      <MoreFilters open={moreOpen} onClose={() => setMoreOpen(false)} branch={branchFilter} flag={flag} onApply={(b, f) => { url.set({ vbranch: b || null, flag: f || null, page: null }); setMoreOpen(false); }} />
      <TransitionDialog vehicle={transition} onClose={() => setTransition(null)} onDone={(ids) => ids.forEach(queueAck)} />
      <Dialog open={bulk === "archive"} onClose={() => setBulk(null)} title="Archive selected vehicles" description="Archived vehicles leave availability and advertising eligibility. This is reversible only by an owner." footer={<><Button onClick={() => setBulk(null)}>Cancel</Button><Button variant="danger" onClick={() => { const r = run((s, a) => bulkArchive(s, a, selected)); if (r.ok) toast(`${r.archived} vehicle(s) archived.`); else toast(r.message, "error"); setSelected([]); setBulk(null); }}>Archive {selected.length} vehicles</Button></>}>
        <p className="muted">Only available or in-preparation vehicles in your permitted branches are archived. Reserved and sold vehicles are skipped.</p>
      </Dialog>
      <AssignDialog open={bulk === "assign"} onClose={() => setBulk(null)} count={selected.length} onConfirm={(branch) => { const r = run((s, a) => bulkAssignBranch(s, a, selected, branch)); if (r.ok) toast(`${r.moved} vehicle(s) moved.`); else toast(r.message, "error"); setSelected([]); setBulk(null); }} />
      <Dialog open={bulk === "publish"} onClose={() => { setBulk(null); setPublishResults(null); }} title="Publish selected vehicles" description="Channel checklist and sync results." footer={publishResults ? <Button variant="primary" onClick={() => { setBulk(null); setPublishResults(null); }}>Done</Button> : <><Button onClick={() => setBulk(null)}>Cancel</Button><Button variant="primary" onClick={() => { const r = run((s, a) => publishVehicles(s, a, selected)); if (r.ok) setPublishResults(r.results); else toast(r.message, "error"); }}>Run publish checklist</Button></>}>
        {publishResults ? <ul className="stack-sm" style={{ margin: 0, paddingLeft: 18 }}>{publishResults.map((r) => <li key={r.id}><strong>{r.id}</strong>: {r.channels.map((c) => `${c.channel} ${c.status.toLowerCase()} (${c.detail})`).join("; ")}</li>)}</ul> : <p className="muted">Only available vehicles publish. Owned site updates now; marketplaces need an authorised publishing API.</p>}
      </Dialog>
    </div>
  );
}

function MoreFilters({ open, onClose, branch, flag, onApply }: { open: boolean; onClose: () => void; branch: string; flag: string; onApply: (branch: string, flag: string) => void }) {
  const { state, session } = useWorkspace();
  const [b, setB] = useState(branch);
  const [f, setF] = useState(flag);
  useEffect(() => { if (open) { setB(branch); setF(flag); } }, [open, branch, flag]);
  return (
    <Dialog open={open} onClose={onClose} title="More filters" description="Branch and stock data-quality flags." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onApply(b, f)}>Apply</Button></>}>
      <SelectField label="Branch" value={b} onChange={(e) => setB(e.target.value)} options={state.branches.filter((x) => session.branchIds.includes(x.id)).map((x) => ({ value: x.id, label: x.name }))} placeholder="All permitted branches" />
      <SelectField label="Data-quality flag" value={f} onChange={(e) => setF(e.target.value)} options={[{ value: "cost", label: "Cost incomplete" }, { value: "media", label: "Missing photo" }, { value: "review", label: "Price review" }]} placeholder="No flag filter" />
    </Dialog>
  );
}

function AssignDialog({ open, onClose, count, onConfirm }: { open: boolean; onClose: () => void; count: number; onConfirm: (branch: string) => void }) {
  const { state, session } = useWorkspace();
  const [branch, setBranch] = useState("");
  return (
    <Dialog open={open} onClose={onClose} title="Assign branch" description={`${count} selected vehicle(s) move to the chosen branch.`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!branch} onClick={() => onConfirm(branch)}>Assign {count}</Button></>}>
      <SelectField label="Branch" required value={branch} onChange={(e) => setBranch(e.target.value)} options={state.branches.filter((x) => session.branchIds.includes(x.id)).map((x) => ({ value: x.id, label: x.name }))} placeholder="Choose a branch" />
    </Dialog>
  );
}

const ALLOWED: Record<Lifecycle, Lifecycle[]> = { preparation: ["available", "archived"], available: ["reserved", "sold", "archived", "preparation"], reserved: ["available", "sold"], sold: [], archived: [] };

function TransitionDialog({ vehicle, onClose, onDone }: { vehicle: Vehicle | null; onClose: () => void; onDone: (pausedCampaigns: string[]) => void }) {
  const { run } = useWorkspace();
  const toast = useToast();
  const [to, setTo] = useState<Lifecycle | "">("");
  const [note, setNote] = useState("");
  const [price, setPrice] = useState("");
  const [direct, setDirect] = useState("");
  const [closed, setClosed] = useState(() => new Date(new Date(SNAPSHOT_AT).getTime() + 330 * 60_000).toISOString().slice(0, 10));
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (vehicle) { setTo(""); setNote(""); setPrice(""); setDirect(""); setErrors({}); } }, [vehicle]);
  if (!vehicle) return null;
  const options = ALLOWED[vehicle.status];
  const submit = () => {
    if (!to) { setErrors({ to: "Choose the next state." }); return; }
    const t: Transition = { to, note, sale: to === "sold" ? { salePrice: price, directCosts: direct, closedOn: closed } : undefined };
    const r = run((s, a) => transitionVehicle(s, a, vehicle.id, vehicle.version, t));
    if (!r.ok) { setErrors(r.fields ?? { form: r.message }); return; }
    toast(`${vehicle.id}: ${LIFECYCLE_LABEL[vehicle.status]} → ${LIFECYCLE_LABEL[to]}.${r.pausedCampaigns.length ? ` Pause requested for ${r.pausedCampaigns.join(", ")}: pending until the platform acknowledges.` : ""}${r.sale ? ` Sale ${r.sale.id} recorded.` : ""}`);
    onDone(r.pausedCampaigns);
    onClose();
  };
  return (
    <Dialog open onClose={onClose} dirty={Boolean(to)} title={`Change state of ${vehicle.id}`} description={`${vehicle.make} ${vehicle.model} is ${LIFECYCLE_LABEL[vehicle.status]}. Transitions are explicit and audited.`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Confirm change</Button></>}>
      <FormSummary errors={errors} />
      <SelectField label="New state" required value={to} onChange={(e) => setTo(e.target.value as Lifecycle)} options={options.map((o) => ({ value: o, label: LIFECYCLE_LABEL[o] }))} placeholder="Choose state" error={errors.to} data-autofocus />
      {to === "reserved" ? <TextField label="Reserved for / booking reference" required value={note} onChange={(e) => setNote(e.target.value)} error={errors.note} /> : null}
      {to === "sold" ? <>
        <Notice tone="warn">Sold requires a reconciled sale record. This creates sale entry with landed cost {formatMoney(landedCost(vehicle.costs))}.</Notice>
        <TextField label="Sale price (₹)" required inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} error={errors.salePrice} placeholder="29,50,000" />
        <TextField label="Direct selling and holding costs (₹)" inputMode="decimal" value={direct} onChange={(e) => setDirect(e.target.value)} error={errors.directCosts} placeholder="0" />
        <TextField label="Sale-close date" type="date" required value={closed} onChange={(e) => setClosed(e.target.value)} error={errors.closedOn} />
      </> : null}
      {to === "reserved" || to === "sold" || to === "archived" ? <Notice role="status">Active or approved campaigns for this vehicle will be paused or invalidated. Pause shows pending until the platform acknowledges it.</Notice> : null}
    </Dialog>
  );
}

function ImportDialog({ open, onClose, branchId }: { open: boolean; onClose: () => void; branchId: string }) {
  const { state, run } = useWorkspace();
  const toast = useToast();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  useEffect(() => { if (open) { setStep(1); setCsv(""); setFileName(""); setMapping({}); setResult(null); } }, [open]);
  const headers = useMemo(() => (csv ? (csv.split(/\r?\n/)[0] ?? "").split(",").map((h) => h.trim()) : []), [csv]);
  useEffect(() => { if (headers.length) setMapping(Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, headers.find((h) => h.toLowerCase().replace(/[^a-z]/g, "") === c.replace(/_/g, "")) ?? ""]))); }, [headers]);
  const preview = useMemo(() => (step >= 3 ? importPreview(state, csv, mapping, branchId) : null), [step, state, csv, mapping, branchId]);
  const valid = preview?.rows.filter((r) => r.status === "valid").length ?? 0;
  const batchKey = `import-${csv.length}-${fileName}`;
  const errorsCsv = (rows: ImportRow[]) => downloadCsv("import-errors.csv", [["line", "status", "reason"], ...rows.filter((r) => r.status !== "valid").map((r) => [String(r.line), r.status, r.errors.join("; ")])]);
  return (
    <Dialog open={open} onClose={onClose} dirty={Boolean(csv) && step < 4} size="w720" title="Import stock from CSV" description={`Step ${step} of 4 / ${["Upload", "Map columns", "Validate", "Result"][step - 1]}. Nothing is overwritten silently.`}
      footer={step === 4 ? <Button variant="primary" onClick={onClose}>Done</Button> : <>
        <Button onClick={onClose}>Cancel</Button>
        {step > 1 ? <Button onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}>Back</Button> : null}
        {step === 1 ? <Button variant="primary" disabled={!csv} onClick={() => setStep(2)}>Continue</Button> : null}
        {step === 2 ? <Button variant="primary" onClick={() => setStep(3)}>Preview validation</Button> : null}
        {step === 3 ? <Button variant="primary" disabled={!valid} onClick={() => { const r = run((s, a) => importCommit(s, a, preview!.rows, branchId, batchKey)); if (r.ok) { setResult({ imported: r.imported, skipped: r.skipped }); setStep(4); toast(`${r.imported} vehicle(s) imported as In preparation.`); } else toast(r.message, "error"); }}>Commit {valid} valid row{valid === 1 ? "" : "s"}</Button> : null}
      </>}>
      {step === 1 ? (
        <div className="stack">
          <div className="field"><label htmlFor="csv-file">CSV file</label><input id="csv-file" className="input" type="file" accept=".csv,text/csv" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setFileName(file.name); setCsv(await file.text()); }} /><div className="help">Up to 500 rows. Columns are mapped in the next step.</div></div>
          <Button size="sm" onClick={() => downloadCsv("stock-import-sample.csv", SAMPLE_CSV.trim().split("\n").map((l) => l.split(",")))}>Download sample CSV</Button>
          <div className="field"><label htmlFor="csv-paste">Or paste CSV</label><textarea id="csv-paste" className="textarea" value={csv} onChange={(e) => { setCsv(e.target.value); setFileName("pasted"); }} placeholder={SAMPLE_CSV.split("\n")[0]} /></div>
        </div>
      ) : null}
      {step === 2 ? <div className="form-grid">{IMPORT_COLUMNS.map((c) => <SelectField key={c} label={c.replace(/_/g, " ")} value={mapping[c] ?? ""} onChange={(e) => setMapping({ ...mapping, [c]: e.target.value })} options={headers} placeholder="Not mapped" />)}</div> : null}
      {step === 3 && preview ? (
        <div className="stack">
          <div className="row-flex"><Badge tone="accent">{valid} valid</Badge><Badge tone="warn">{preview.rows.filter((r) => r.status === "duplicate").length} duplicate</Badge><Badge tone="danger">{preview.rows.filter((r) => r.status === "error").length} errors</Badge>
            {preview.rows.some((r) => r.status !== "valid") ? <Button size="sm" onClick={() => errorsCsv(preview.rows)}>Download error report</Button> : null}</div>
          <div className="table-wrap fit"><table className="data-table dense"><thead><tr><th>Line</th><th>Vehicle</th><th>Status</th><th>Issues</th></tr></thead>
            <tbody>{preview.rows.slice(0, 50).map((r) => <tr key={r.line}><td>{r.line}</td><td>{r.values.make} {r.values.model}</td><td>{r.status === "valid" ? "Valid" : r.status === "duplicate" ? "Duplicate" : "Error"}</td><td className="muted">{r.errors.join("; ") || MISSING}</td></tr>)}</tbody></table></div>
        </div>
      ) : null}
      {step === 4 && result ? <Notice tone="accent" role="status">{result.imported} imported, {result.skipped} skipped. Retrying this file cannot import the same rows twice.</Notice> : null}
    </Dialog>
  );
}

export { formatCount, Skeleton };
