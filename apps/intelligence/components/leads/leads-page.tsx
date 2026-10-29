"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { addLead, assignLead, cancelAppointment, canMessage, changeStage, LEAD_SOURCES, leadsForExport, logOutcome, mergeLeads, retryMessage, scheduleAppointment, sendMessage, toggleTask } from "@/lib/actions";
import { LEAD_STAGES, type Lead, type LeadStage, type Sale, type Vehicle } from "@/lib/domain";
import { downloadCsv } from "@/lib/export";
import { formatDateTime, formatMoney, formatShortDateTime, MISSING, relativeAge } from "@/lib/format";
import { SNAPSHOT_AT } from "@/lib/time";
import { Dialog, Drawer, Menu } from "../overlay";
import { RemotePanel } from "../panel";
import { useRemote } from "../use-remote";
import { useToast } from "../toast";
import { Badge, Button, Check, EmptyState, FormSummary, Notice, PageHead, SelectField, Tabs, TextArea, TextField } from "../ui";
import { useScopedHref, useUrlState, useWorkspace } from "../workspace";

const MAIN_STAGES: LeadStage[] = ["New", "Contacted", "Qualified", "Appointment"];
const MORE_STAGES: LeadStage[] = ["Visited", "Test drive", "Negotiation", "Won", "Lost", "Nurture"];

type LeadPageData = { leads: Lead[]; vehicles: Vehicle[]; total: number; page: number; size: number; owners: string[]; anyLeads: boolean; stages: Record<string, number> };

export function LeadsPage({ leadId }: { leadId?: string }) {
  const { state, scope, can, run, mergeRecords } = useWorkspace();
  const url = useUrlState();
  const href = useScopedHref();
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [pending, setPending] = useState<{ lead: Lead; stage: LeadStage } | null>(null);
  const stage = url.get("stage", "all");
  const owner = url.get("owner");
  const source = url.get("source");
  const vehicle = url.get("vehicle");
  const created = url.get("created", "30");
  const overdue = url.get("overdue") === "1";
  const mine = url.get("mine") === "1";
  const view = url.get("view", "list");
  const open = url.get("lead") || leadId || "";

  // Filtering, counting and paging happen in the database. The pipeline view loads the most recently touched leads instead of a page.
  const pageNo = Math.max(1, Number(url.get("page", "1")) || 1);
  const size = [25, 50, 100].includes(Number(url.get("size"))) ? Number(url.get("size")) : 25;
  const query = useMemo(() => {
    const p = new URLSearchParams({ stage, created, branches: scope.ids.join(","), page: String(view === "pipeline" ? 1 : pageNo), size: String(view === "pipeline" ? 200 : size) });
    if (view === "pipeline") p.set("order", "recent");
    for (const [k, v] of Object.entries({ owner, source, vehicle, overdue: overdue ? "1" : "", mine: mine ? "1" : "" })) if (v) p.set(k, v);
    return p.toString();
  }, [stage, created, scope.ids, view, pageNo, size, owner, source, vehicle, overdue, mine]);
  const remote = useRemote<LeadPageData>(`/api/leads?${query}`, (d) => mergeRecords({ leads: d.leads, vehicles: d.vehicles }));
  const cachedLeads = useMemo(() => new Map(state.leads.map((l) => [l.id, l])), [state.leads]);
  const rows = useMemo(() => (remote.data?.leads ?? []).map((l) => cachedLeads.get(l.id) ?? l), [remote.data, cachedLeads]);
  const cachedVehicles = useMemo(() => new Map(state.vehicles.map((v) => [v.id, v])), [state.vehicles]);
  const owners = remote.data?.owners ?? [];
  const total = remote.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));
  const currentPage = remote.data?.page ?? 1;
  const anyLeads = remote.data?.anyLeads ?? true;
  const stageCount = remote.data?.stages ?? {};
  const needsDetail = open && !state.leads.some((l) => l.id === open);
  const deep = useRemote<{ lead: Lead }>(needsDetail ? `/api/leads/${encodeURIComponent(open)}` : null, (d) => mergeRecords({ leads: [d.lead] }));
  const filterCount = [owner, source, vehicle, created !== "30" ? created : "", overdue ? "1" : "", mine ? "1" : ""].filter(Boolean).length;
  const selected = open ? state.leads.find((l) => l.id === open) : undefined;
  const clearFilters = () => url.set({ owner: null, source: null, vehicle: null, created: null, overdue: null, mine: null });

  const tabs = [{ value: "all", label: "All leads" }, ...MAIN_STAGES.map((s) => ({ value: s, label: s })), { value: MORE_STAGES.includes(stage as LeadStage) ? stage : "more", label: MORE_STAGES.includes(stage as LeadStage) ? stage : "More stages" }];

  const reasonFor = (l: Lead) => (l.nextActionTone === "warning" ? "warn-text" : "");
  const handleStage = (lead: Lead, next: LeadStage) => {
    if (next === lead.stage) return;
    if (next === "Won" || next === "Lost") { setPending({ lead, stage: next }); return; }
    const r = run((s, a) => changeStage(s, a, lead.id, lead.version, next));
    if (r.ok) toast(`${lead.id} moved to ${next}.`); else toast(r.message, "error");
  };

  return (
    <div className="page">
      <PageHead title="Leads and customers" lead="Vehicle context, responsible follow-up and a traceable pipeline."
        actions={<>
          {can("leads.export") ? <Button onClick={() => { downloadCsv("leads-export.csv", leadsForExport(rows), ["# Contact fields minimised: masked or omitted"]); toast("Exported without contact numbers."); }}>Export</Button> : null}
          <Button variant="primary" className="primary-cta" onClick={() => setAddOpen(true)} disabled={!can("leads.edit")} reason={!can("leads.edit") ? "Requires Owner, Manager or Sales access." : undefined}>Add lead</Button>
        </>} />

      <div className="lead-tabs only-desktop">
        <Tabs label="Lead stage" value={stage === "all" || MAIN_STAGES.includes(stage as LeadStage) || MORE_STAGES.includes(stage as LeadStage) ? (MORE_STAGES.includes(stage as LeadStage) ? stage : stage) : "all"} onChange={(v) => { if (v === "more") return; url.set({ stage: v === "all" ? null : v }); }} tabs={tabs} idPrefix="lead" />
        <Menu label="More stages" icon="chevronDown" buttonClass="btn btn-ghost" align="left" text={<>More stages<Icon2 /></>}>
          {(close) => <>{MORE_STAGES.map((s) => <button key={s} role="menuitemradio" aria-checked={stage === s} onClick={() => { url.set({ stage: s }); close(); }}>{s}</button>)}</>}
        </Menu>
      </div>
      <div className="only-mobile row-flex" style={{ position: "sticky", top: 56, zIndex: 20, background: "var(--canvas)", padding: "8px 0" }}>
        <Button className="btn-block" aria-pressed={mine} onClick={() => url.set({ mine: mine ? null : "1" })} style={{ flex: 1 }}>My leads</Button>
        <Button className="btn-block" onClick={() => setFilterOpen(true)} style={{ flex: 1 }}>Filters{filterCount ? ` (${filterCount})` : ""}</Button>
      </div>

      <div className="lead-filters only-desktop" role="group" aria-label="Filters">
        <SelectField label="Owner" aria-label="Owner" value={owner} onChange={(e) => url.set({ owner: e.target.value || null })} options={owners} placeholder="All owners" />
        <SelectField label="Source" aria-label="Source" value={source} onChange={(e) => url.set({ source: e.target.value || null })} options={[...LEAD_SOURCES]} placeholder="All sources" />
        <TextField label="Vehicle (stock ID)" aria-label="Vehicle stock ID" value={vehicle} onChange={(e) => url.set({ vehicle: e.target.value.trim() || null, page: null })} placeholder="e.g. V-1001 or unspecified" />
        <SelectField label="Created" aria-label="Created" value={created} onChange={(e) => url.set({ created: e.target.value === "30" ? null : e.target.value })} options={[{ value: "7", label: "Created: 7 days" }, { value: "30", label: "Created: 30 days" }, { value: "all", label: "Created: any time" }]} />
        <Button aria-pressed={overdue} variant={overdue ? "primary" : "secondary"} onClick={() => url.set({ overdue: overdue ? null : "1" })}>Overdue only</Button>
      </div>
      {filterCount ? <div className="chip-row"><span className="meta" aria-live="polite">{filterCount} active filter{filterCount > 1 ? "s" : ""}</span><button className="link-btn" onClick={clearFilters}>Clear all</button></div> : null}

      <RemotePanel title="Leads" remote={remote} rows={8}>
        {remote.data && !anyLeads ? <EmptyState title="No leads yet" actions={<><Button variant="primary" onClick={() => setAddOpen(true)} disabled={!can("leads.edit")}>Add lead</Button><Link className="btn" href={href("/app/settings/integrations")}>Configure capture</Link></>}>Enquiries from your website, campaigns and walk-ins appear here with their vehicle context.</EmptyState>
          : remote.data && rows.length === 0 ? <EmptyState title="No leads match" actions={<Button onClick={() => { clearFilters(); url.set({ stage: null }); }}>Reset filters</Button>}>Nothing matches the current stage and filters. No notification implies a contact attempt.</EmptyState>
          : view === "pipeline" ? (
            <Pipeline leads={rows} counts={stageCount} onOpen={(id) => url.set({ lead: id })} onStage={handleStage} />
          ) : (
            <>
              <div className="table-wrap only-desktop">
                <table className="data-table" aria-label="Leads">
                  <thead><tr><th style={{ width: 180 }}>Lead</th><th style={{ width: 204 }}>Vehicle</th><th style={{ width: 134 }}>Source</th><th style={{ width: 164 }}>Stage</th><th style={{ width: 120 }}>Owner</th><th style={{ width: 142 }}>Last touch</th><th style={{ width: 216 }}>Next action</th></tr></thead>
                  <tbody>{rows.map((l) => {
                    const v = cachedVehicles.get(l.vehicleId ?? "");
                    return (
                      <tr key={l.id}>
                        <td><button type="button" className="row-title" onClick={() => url.set({ lead: l.id })}>{l.name}</button><span className="sub">{l.id} / masked contact</span></td>
                        <td>{l.vehicleId ? `${v ? (/^5\d\dd$/.test(v.model) ? v.make : v.model) : ""} / ${l.vehicleId}`.replace(/^ \/ /, "") : "Unspecified"}</td><td>{l.source}</td><td>{l.stage}</td><td>{l.owner}</td><td>{relativeAge(l.lastTouchAt, SNAPSHOT_AT)}</td>
                        <td><button type="button" className={`link-btn ${reasonFor(l)}`} style={{ color: l.nextActionTone === "warning" ? "var(--warning)" : "var(--text)" }} onClick={() => url.set({ lead: l.id })}>{l.nextAction}</button></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
              <ul className="card-list only-mobile" aria-label="Leads">
                {rows.map((l) => (
                  <li key={l.id} className="card tight listing-card">
                    <button type="button" className="h3 link-btn" style={{ color: "var(--text)" }} onClick={() => url.set({ lead: l.id })}>{l.name} / {l.stage}</button>
                    <span className="meta">{l.vehicleId ?? "Unspecified"} / {l.source}</span>
                    <span className={l.nextActionTone === "warning" ? "warn-text meta" : "tone-accent meta"}>{l.nextAction}{l.nextActionTone === "warning" ? " ⚠ overdue or review" : ""}</span>
                    <span className="meta">{l.owner} / {relativeAge(l.lastTouchAt, SNAPSHOT_AT)}</span>
                  </li>
                ))}
              </ul>
              {view !== "pipeline" ? (
                <div className="pager">
                  <span className="meta">{(currentPage - 1) * size + 1}-{Math.min(total, currentPage * size)} of {total}</span>
                  <div className="row-flex">
                    <label className="sr-only" htmlFor="lead-page-size">Rows per page</label>
                    <select id="lead-page-size" className="select" style={{ width: 96, minHeight: 44 }} value={size} onChange={(e) => url.set({ size: e.target.value === "25" ? null : e.target.value, page: null })}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select>
                    <Button disabled={currentPage <= 1} onClick={() => url.set({ page: currentPage - 1 === 1 ? null : currentPage - 1 }, { push: true })}>Previous</Button>
                    <Button disabled={currentPage >= pages} onClick={() => url.set({ page: currentPage + 1 }, { push: true })}>Next</Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
      </RemotePanel>
      {deep.status === "error" && open && !selected ? <div className="notice danger" role="alert">{deep.code === 404 ? "That lead does not exist or is not available to you." : deep.error} <button className="link-btn" onClick={() => url.set({ lead: null })}>Close</button></div> : null}
      <div className="spread" style={{ flexWrap: "wrap" }}>
        <p className="meta">Contacts are masked unless your role may contact leads / message delivery is not a contact outcome</p>
        <div className="seg" role="group" aria-label="View"><Button variant={view !== "pipeline" ? "primary" : "secondary"} aria-pressed={view !== "pipeline"} onClick={() => url.set({ view: null })}>List</Button><Button variant={view === "pipeline" ? "primary" : "secondary"} aria-pressed={view === "pipeline"} onClick={() => url.set({ view: "pipeline" })}>Pipeline</Button></div>
      </div>

      <AddLead open={addOpen} onClose={() => setAddOpen(false)} />
      <FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} owners={owners} />
      {selected ? <LeadDrawer key={selected.id} lead={selected} onClose={() => url.set({ lead: null })} /> : null}
      <StageDialog pending={pending} onClose={() => setPending(null)} />
    </div>
  );
}

function Icon2() { return <span aria-hidden="true" style={{ marginLeft: 4 }}>▾</span>; }

function Pipeline({ leads, counts, onOpen, onStage }: { leads: Lead[]; counts: Record<string, number>; onOpen: (id: string) => void; onStage: (lead: Lead, stage: LeadStage) => void }) {
  const [drag, setDrag] = useState<string | null>(null);
  return (
    <div className="pipeline" role="list" aria-label="Pipeline by canonical stage">
      {LEAD_STAGES.map((s) => {
        const items = leads.filter((l) => l.stage === s);
        const gross = items.reduce((a, l) => a + (l.expectedGross ?? 0), 0);
        return (
          <section key={s} className="pipe-col" role="listitem" aria-label={`${s}: ${items.length} leads`} onDragOver={(e) => e.preventDefault()} onDrop={() => { const l = leads.find((x) => x.id === drag); if (l) onStage(l, s); setDrag(null); }}>
            <h3 className="h3">{s} <span className="meta">({counts[s] ?? items.length}{(counts[s] ?? 0) > items.length ? `, showing ${items.length} most recent` : ""})</span></h3>
            <p className="meta">{gross ? `Expected gross ${formatMoney(gross)}` : "Expected gross: not set"}</p>
            {items.map((l) => (
              <div key={l.id} className="card tight pipe-card" draggable onDragStart={() => setDrag(l.id)}>
                <button className="link-btn" style={{ color: "var(--text)", fontWeight: 600 }} onClick={() => onOpen(l.id)}>{l.name}</button>
                <span className="meta">{l.id} / {l.vehicleId ?? "Unspecified"}</span>
                <label className="sr-only" htmlFor={`stage-${l.id}`}>Move {l.id} to stage</label>
                <select id={`stage-${l.id}`} className="select" style={{ minHeight: 36, padding: "4px 8px" }} value={l.stage} onChange={(e) => onStage(l, e.target.value as LeadStage)}>{LEAD_STAGES.map((st) => <option key={st}>{st}</option>)}</select>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function StageDialog({ pending, onClose }: { pending: { lead: Lead; stage: LeadStage } | null; onClose: () => void }) {
  const { run, mergeRecords, scope } = useWorkspace();
  const toast = useToast();
  const [saleId, setSaleId] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { setSaleId(""); setReason(""); setErrors({}); }, [pending]);
  const salesRemote = useRemote<{ sales: Sale[] }>(pending?.stage === "Won" ? `/api/sales?state=Completed&size=50&branches=${scope.ids.join(",")}` : null, (d) => mergeRecords({ sales: d.sales }));
  if (!pending) return null;
  const sales = salesRemote.data?.sales ?? [];
  return (
    <Dialog open onClose={onClose} title={`Move ${pending.lead.id} to ${pending.stage}`} description={pending.stage === "Won" ? "Won requires a reconciled sale link. Stage Won alone never posts revenue or profit." : "Lost requires a reason."}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { const r = run((s, a) => changeStage(s, a, pending.lead.id, pending.lead.version, pending.stage, { saleId, lostReason: reason })); if (!r.ok) { setErrors(r.fields ?? { form: r.message }); return; } toast(`${pending.lead.id} moved to ${pending.stage}.`); onClose(); }}>Confirm</Button></>}>
      <FormSummary errors={errors} />
      {pending.stage === "Won" ? <SelectField label="Linked sale" required value={saleId} onChange={(e) => setSaleId(e.target.value)} options={sales.map((s) => ({ value: s.id, label: `${s.id} / ${s.label}` }))} placeholder="Choose a reconciled sale" error={errors.saleId} /> : <TextArea label="Reason lost" required value={reason} onChange={(e) => setReason(e.target.value)} error={errors.lostReason} />}
    </Dialog>
  );
}

function FilterSheet({ open, onClose, owners }: { open: boolean; onClose: () => void; owners: string[] }) {
  const url = useUrlState();
  return (
    <Dialog open={open} onClose={onClose} title="Filters" footer={<><Button onClick={() => { url.set({ owner: null, source: null, vehicle: null, created: null, overdue: null, stage: null }); onClose(); }}>Clear all</Button><Button variant="primary" onClick={onClose}>Done</Button></>}>
      <SelectField label="Stage" value={url.get("stage")} onChange={(e) => url.set({ stage: e.target.value || null })} options={[...LEAD_STAGES]} placeholder="All stages" />
      <SelectField label="Owner" value={url.get("owner")} onChange={(e) => url.set({ owner: e.target.value || null })} options={owners} placeholder="All owners" />
      <SelectField label="Source" value={url.get("source")} onChange={(e) => url.set({ source: e.target.value || null })} options={[...LEAD_SOURCES]} placeholder="All sources" />
      <TextField label="Vehicle (stock ID)" value={url.get("vehicle")} onChange={(e) => url.set({ vehicle: e.target.value.trim() || null, page: null })} />
      <Check label="Overdue only" checked={url.get("overdue") === "1"} onChange={(v) => url.set({ overdue: v ? "1" : null })} />
    </Dialog>
  );
}

function AddLead({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, run, scope, session, mergeRecords } = useWorkspace();
  // The freshest stock first; a long list is capped rather than loaded in full.
  const stock = useRemote<{ vehicles: Vehicle[] }>(open ? `/api/inventory?tab=all&size=200&sort=age&dir=asc&branches=${scope.ids.join(",")}` : null, (d) => mergeRecords({ vehicles: d.vehicles }));
  const toast = useToast();
  const url = useUrlState();
  const blank = { name: "", contact: "", source: "", vehicleId: "", owner: session.name, consentEvidence: "", marketingConsent: false };
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (open) { setForm({ ...blank, owner: state.team.find((t) => t.role === "sales" && t.name === session.name)?.name ?? session.name }); setErrors({}); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const vehicles = (stock.data?.vehicles ?? []).filter((v) => v.status === "available" || v.status === "reserved" || v.status === "preparation");
  return (
    <Dialog open={open} onClose={onClose} dirty={Boolean(form.name || form.contact)} title="Add lead" description="Name or contact, source, vehicle (or Unspecified interest), owner and consent provenance are required." size="w640"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => {
        const r = run((s, a) => addLead(s, a, { ...form, branchId: scope.ids[0] ?? "" }));
        if (!r.ok) { setErrors(r.fields ?? { form: r.message }); return; }
        toast(`${r.lead.id} added${r.lead.duplicateOf ? `. Possible duplicate of ${r.lead.duplicateOf}: review before merging.` : "."}`); onClose(); url.set({ lead: r.lead.id });
      }}>Add lead</Button></>}>
      <FormSummary errors={errors} />
      <div className="form-grid">
        <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} data-autofocus />
        <TextField label="Phone" type="tel" inputMode="tel" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} error={errors.contact} placeholder="+91 90000 00000" />
        <SelectField label="Source" required value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} options={[...LEAD_SOURCES]} placeholder="Choose source" error={errors.source} />
        <SelectField label="Vehicle" required value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} options={[{ value: "unspecified", label: "Unspecified interest" }, ...vehicles.map((v) => ({ value: v.id, label: `${v.id} / ${v.make} ${v.model}` }))]} placeholder="Choose vehicle" error={errors.vehicleId} />
        <SelectField label="Owner" required value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} options={state.team.filter((t) => ["sales", "manager", "owner"].includes(t.role) && t.status === "Active").map((t) => t.name)} error={errors.owner} />
        <TextField label="Consent provenance" required value={form.consentEvidence} onChange={(e) => setForm({ ...form, consentEvidence: e.target.value })} error={errors.consentEvidence} placeholder="Walk-in form, phone, website" />
      </div>
      <Check label="Customer also agreed to marketing messages" checked={form.marketingConsent} onChange={(v) => setForm({ ...form, marketingConsent: v })} help="Without this, only service responses to the enquiry are allowed." />
    </Dialog>
  );
}

function LeadDrawer({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { state, run, can, mergeRecords } = useWorkspace();
  // Related records (the vehicle, other leads from the same contact, a duplicate) are fetched with the lead rather than assumed to be loaded.
  useRemote<{ lead: Lead; vehicle: Vehicle | null; linked: Lead[]; duplicate: Lead | null }>(`/api/leads/${encodeURIComponent(lead.id)}`, (d) => mergeRecords({ vehicles: d.vehicle ? [d.vehicle] : [], leads: [...d.linked, ...(d.duplicate ? [d.duplicate] : [])] }));
  const href = useScopedHref();
  const toast = useToast();
  const [reveal, setReveal] = useState(false);
  const [outcomeOpen, setOutcomeOpen] = useState<null | "Call" | "Message" | "Note">(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const [apptOpen, setApptOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const vehicle = state.vehicles.find((v) => v.id === lead.vehicleId);
  const linked = state.leads.filter((l) => l.id !== lead.id && l.contactFull && l.contactFull === lead.contactFull);
  const duplicate = lead.duplicateOf ? state.leads.find((l) => l.id === lead.duplicateOf) : undefined;
  const canSee = can("leads.contact");
  const contact = reveal && canSee ? lead.contactFull : lead.contactMasked;
  const elig = canMessage(lead);
  const campaign = state.campaigns.find((c) => c.id === lead.campaignId);

  return (
    <Drawer open onClose={onClose} size="w560" title={`${lead.name} / ${lead.id}`} description={`${lead.stage} / owner ${lead.owner} / created ${formatShortDateTime(lead.createdAt)}`}
      footer={<><Button onClick={onClose}>Close</Button><a className={`btn ${!canSee ? "btn-disabled" : ""}`} aria-disabled={!canSee} href={canSee ? `tel:${lead.contactFull.replace(/\s/g, "")}` : undefined} onClick={(e) => { if (!canSee) { e.preventDefault(); return; } setOutcomeOpen("Call"); }}>Call</a><Button onClick={() => setMessageOpen(true)} disabled={!canSee} reason={!canSee ? "Messaging needs Owner, Manager or Sales access." : undefined}>Message</Button><Button variant="primary" onClick={() => setOutcomeOpen("Call")} disabled={!canSee}>Log outcome</Button></>}>
      <section className="card tight" aria-label="Contact and consent">
        <div className="spread"><div><div className="meta">Contact</div><strong>{contact}</strong></div>{canSee ? <Button size="sm" onClick={() => setReveal((v) => !v)} aria-pressed={reveal}>{reveal ? "Mask" : "Reveal"}</Button> : <Badge>Masked by role</Badge>}</div>
        <p className="meta mt-2">Consent: {lead.consent.marketing ? "marketing + service" : "service-response only"} / {lead.consent.evidence} / captured {formatShortDateTime(lead.consent.capturedAt)}</p>
        {!lead.consent.marketing ? <p className="meta">Missing marketing consent blocks marketing messages. A service response follows configured policy.</p> : null}
      </section>
      {duplicate ? <Notice tone="warn" role="status">Possible duplicate of {duplicate.id} ({duplicate.name}). <button className="link-btn" onClick={() => setMergeOpen(true)}>Review merge</button></Notice> : null}
      <dl className="kv">
        <div><dt>Vehicle</dt><dd>{vehicle ? <Link className="accent-text" href={href(`/app/inventory/${vehicle.id}`)}>{vehicle.make} {vehicle.model} / {vehicle.id}</Link> : lead.vehicleId ?? "Unspecified interest"}</dd></div>
        <div><dt>Source</dt><dd>{lead.source}{campaign ? ` / ${campaign.id}` : ""}</dd></div>
        <div><dt>Stage</dt><dd><StageSelect lead={lead} /></dd></div>
        <div><dt>Owner</dt><dd><OwnerSelect lead={lead} /></dd></div>
        <div><dt>Next action</dt><dd>{lead.nextAction}</dd></div>
      </dl>
      {lead.stage === "Won" && lead.saleId ? <Notice tone="accent">Linked sale {lead.saleId}. Realized profit comes only from the reconciled sale.</Notice> : null}
      {lead.stage === "Lost" ? <Notice>Lost: {lead.lostReason}</Notice> : null}

      <section aria-labelledby="tasks-h"><h3 className="h3" id="tasks-h">Tasks</h3>
        {lead.tasks.length ? <ul className="stack-sm" style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>{lead.tasks.map((t) => <li key={t.id}><Check label={<span style={t.done ? { textDecoration: "line-through" } : undefined}>{t.title} <span className="meta">/ due {formatShortDateTime(t.dueAt)}{t.done ? ` / done by ${t.doneBy}` : ""}</span></span>} checked={t.done} onChange={() => { const r = run((s, a) => toggleTask(s, a, lead.id, t.id)); if (r.ok) toast(t.done ? "Task reopened." : "Task completed.", "ok"); }} disabled={!can("leads.edit")} /></li>)}</ul> : <p className="muted">No tasks.</p>}
      </section>

      <section aria-labelledby="appt-h"><div className="spread"><h3 className="h3" id="appt-h">Appointment</h3><Button size="sm" onClick={() => setApptOpen(true)} disabled={!can("leads.edit")}>{lead.appointment && lead.appointment.status !== "Cancelled" ? "Reschedule" : "Schedule"}</Button></div>
        {lead.appointment ? <><p className="mt-2">{lead.appointment.kind} / {formatDateTime(lead.appointment.at)} / {lead.appointment.staff} / <strong>{lead.appointment.status}</strong>{lead.appointment.previousAt ? ` (previous slot ${formatShortDateTime(lead.appointment.previousAt)})` : ""}{lead.appointment.cancelReason ? ` / ${lead.appointment.cancelReason}` : ""}</p>
          {lead.appointment.status !== "Cancelled" ? <div className="row-flex mt-2"><TextField label="Cancel reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /><Button variant="danger" size="sm" onClick={() => { const r = run((s, a) => cancelAppointment(s, a, lead.id, cancelReason)); if (r.ok) { toast("Appointment cancelled."); setCancelReason(""); } else toast(r.fields?.reason ?? r.message, "error"); }}>Cancel appointment</Button></div> : null}</> : <p className="muted mt-2">No appointment. Times use the branch timezone (Asia/Kolkata).</p>}
      </section>

      {linked.length ? <section><h3 className="h3">Customer / linked leads</h3><ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>{linked.map((l) => <li key={l.id}>{l.id} / {l.stage} / {l.vehicleId ?? "Unspecified"}</li>)}</ul><p className="meta">Linked, never merged silently.</p></section> : null}

      <section aria-labelledby="chron-h"><h3 className="h3" id="chron-h">Chronology</h3>
        <ul className="timeline mt-2">{lead.interactions.map((i) => (
          <li key={i.id}><strong>{i.type}{i.outcome ? ` / ${i.outcome}` : ""}{i.delivery ? ` / ${i.delivery === "Queued" ? "Queued: delivery not acknowledged" : i.delivery}` : ""}</strong><span>{i.detail}</span><span className="meta">{i.actor} / {formatShortDateTime(i.at)}</span>
            {i.delivery === "Failed" ? <Button size="sm" onClick={() => run((s, a) => retryMessage(s, a, lead.id, i.id))}>Retry</Button> : null}</li>
        ))}{lead.interactions.length === 0 ? <li className="muted">No interactions yet.</li> : null}</ul>
      </section>
      <OutcomeDialog kind={outcomeOpen} onClose={() => setOutcomeOpen(null)} lead={lead} />
      <MessageDialog open={messageOpen} onClose={() => setMessageOpen(false)} lead={lead} eligibility={elig} />
      <AppointmentDialog open={apptOpen} onClose={() => setApptOpen(false)} lead={lead} />
      <Dialog open={mergeOpen} onClose={() => setMergeOpen(false)} title="Merge duplicate leads" description="Side-by-side preview. Choose the primary record. The merge is audited and reversible." size="w640" footer={<><Button onClick={() => setMergeOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => { if (!duplicate) return; const r = run((s, a) => mergeLeads(s, a, duplicate.id, lead.id)); if (r.ok) toast(`Merged into ${duplicate.id}. Original ${lead.id} kept for audit.`); else toast(r.message, "error"); setMergeOpen(false); onClose(); }} disabled={!can("leads.merge")}>Keep {duplicate?.id} as primary</Button></>}>
        {duplicate ? <div className="table-wrap fit"><table className="data-table dense"><thead><tr><th>Field</th><th>{duplicate.id} (primary)</th><th>{lead.id}</th></tr></thead><tbody>{[["Name", duplicate.name, lead.name], ["Vehicle", duplicate.vehicleId ?? "Unspecified", lead.vehicleId ?? "Unspecified"], ["Source", duplicate.source, lead.source], ["Stage", duplicate.stage, lead.stage], ["Owner", duplicate.owner, lead.owner], ["Created", formatShortDateTime(duplicate.createdAt), formatShortDateTime(lead.createdAt)]].map(([f, a, b]) => <tr key={f}><td>{f}</td><td>{a}</td><td>{b}</td></tr>)}</tbody></table></div> : null}
      </Dialog>
    </Drawer>
  );
}

function StageSelect({ lead }: { lead: Lead }) {
  const { run, can } = useWorkspace();
  const toast = useToast();
  const [pending, setPending] = useState<LeadStage | null>(null);
  return (
    <>
      <select className="select" style={{ width: 180, minHeight: 36, padding: "4px 8px" }} aria-label="Stage" value={lead.stage} disabled={!can("leads.edit")} onChange={(e) => {
        const next = e.target.value as LeadStage;
        if (next === "Won" || next === "Lost") { setPending(next); return; }
        const r = run((s, a) => changeStage(s, a, lead.id, lead.version, next)); if (r.ok) toast(`Moved to ${next}.`); else toast(r.message, "error");
      }}>{LEAD_STAGES.map((s) => <option key={s}>{s}</option>)}</select>
      <StageDialog pending={pending ? { lead, stage: pending } : null} onClose={() => setPending(null)} />
    </>
  );
}

function OwnerSelect({ lead }: { lead: Lead }) {
  const { state, run, can } = useWorkspace();
  const toast = useToast();
  return <select className="select" style={{ width: 180, minHeight: 36, padding: "4px 8px" }} aria-label="Owner" value={lead.owner} disabled={!can("leads.edit")} onChange={(e) => { const r = run((s, a) => assignLead(s, a, lead.id, e.target.value)); if (r.ok) toast(`Assigned to ${e.target.value}.`); }}>{state.team.filter((t) => ["sales", "manager", "owner"].includes(t.role) && t.status === "Active").map((t) => <option key={t.id}>{t.name}</option>)}</select>;
}

function OutcomeDialog({ kind, onClose, lead }: { kind: null | "Call" | "Message" | "Note"; onClose: () => void; lead: Lead }) {
  const { run } = useWorkspace();
  const toast = useToast();
  const [type, setType] = useState<"Call" | "Message" | "Note">("Call");
  const [outcome, setOutcome] = useState("");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { if (kind) { setType(kind); setOutcome(""); setDetail(""); setError(""); } }, [kind]);
  if (!kind) return null;
  return (
    <Dialog open onClose={onClose} dirty={Boolean(detail)} title="Log outcome" description="Neither Call nor Message records a successful contact automatically: log what happened." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { const r = run((s, a) => logOutcome(s, a, lead.id, { kind: type, outcome, detail })); if (!r.ok) { setError(r.fields?.outcome ?? r.message); return; } toast("Outcome logged."); onClose(); }}>Save outcome</Button></>}>
      <SelectField label="Interaction" value={type} onChange={(e) => setType(e.target.value as typeof type)} options={["Call", "Message", "Note"]} />
      <SelectField label="Outcome" required value={outcome} onChange={(e) => setOutcome(e.target.value)} options={["Connected", "No answer", "Busy", "Wrong number", "Replied", "No reply", "Interested", "Not interested"]} placeholder="Choose outcome" error={error} data-autofocus />
      <TextArea label="Notes" value={detail} onChange={(e) => setDetail(e.target.value)} />
    </Dialog>
  );
}

function MessageDialog({ open, onClose, lead, eligibility }: { open: boolean; onClose: () => void; lead: Lead; eligibility: { allowed: boolean; reason: string } }) {
  const { run } = useWorkspace();
  const toast = useToast();
  const [text, setText] = useState("");
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setText(""); setMarketing(false); setError(""); } }, [open]);
  return (
    <Dialog open={open} onClose={onClose} dirty={Boolean(text)} title="Message lead" description={eligibility.reason} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!eligibility.allowed} onClick={() => { const r = run((s, a) => sendMessage(s, a, lead.id, text, marketing)); if (!r.ok) { setError(r.fields?.message ?? r.message); return; } toast("Message queued. Delivery is not confirmed until the integration acknowledges it."); onClose(); }}>Queue message</Button></>}>
      <TextArea label="Message" required value={text} onChange={(e) => setText(e.target.value)} error={error} data-autofocus />
      <Check label="This is a marketing message" checked={marketing} onChange={setMarketing} help={lead.consent.marketing ? "Marketing consent on file." : "Blocked: no marketing consent on file."} />
    </Dialog>
  );
}

function AppointmentDialog({ open, onClose, lead }: { open: boolean; onClose: () => void; lead: Lead }) {
  const { run, state } = useWorkspace();
  const toast = useToast();
  const [form, setForm] = useState({ kind: "Test drive" as "Visit" | "Test drive", date: "", time: "11:00", staff: lead.owner });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (open) { setForm({ kind: "Test drive", date: "", time: "11:00", staff: lead.owner }); setErrors({}); } }, [open, lead.owner]);
  return (
    <Dialog open={open} onClose={onClose} title={lead.appointment ? "Reschedule appointment" : "Schedule appointment"} description="Branch timezone: Asia/Kolkata. Staff and vehicle conflicts are checked." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { const r = run((s, a) => scheduleAppointment(s, a, lead.id, form)); if (!r.ok) { setErrors(r.fields ?? { form: r.message }); toast(r.message, "error"); return; } toast("Appointment saved."); onClose(); }}>Save appointment</Button></>}>
      <FormSummary errors={errors} />
      <SelectField label="Type" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as typeof form.kind })} options={["Visit", "Test drive"]} />
      <div className="form-grid"><TextField label="Date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} error={errors.date} /><TextField label="Time (IST)" type="time" required value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} error={errors.time} /></div>
      <SelectField label="Staff" required value={form.staff} onChange={(e) => setForm({ ...form, staff: e.target.value })} options={state.team.filter((t) => t.role === "sales" && t.status === "Active").map((t) => t.name)} />
    </Dialog>
  );
}

export { MISSING };
