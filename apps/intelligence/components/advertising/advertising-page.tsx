"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { approveCampaign, ADVERTISING_ACCOUNT_ID, CHANNELS, changeVehicle, channelStatus, checkCopy, createCampaign, discardCampaign, factsFor, metricsFor, pauseCampaign, preflight, publishCampaign, resumeCampaign, submitCampaign, totalBudget, updateCampaign, validateCampaign } from "@/lib/actions";
import type { Campaign, CampaignStatus, Vehicle } from "@/lib/domain";
import { formatDate, formatDateTime, formatKm, formatMoney, formatRupees, MISSING, parseRupeeInput, rupees } from "@/lib/format";
import { stockAgeDays } from "@/lib/finance";
import { SNAPSHOT_AT } from "@/lib/time";
import { SpendLine } from "../charts-lazy";
import { Drawer } from "../overlay";
import { Panel } from "../panel";
import { useRemote } from "../use-remote";
import { useToast } from "../toast";
import { Badge, Button, Check, EmptyState, ErrorPanel, FormSummary, Kpi, Notice, PageHead, PanelSkeleton, RupeeField, SelectField, TextArea, TextField } from "../ui";
import { VehicleArt } from "../vehicle-art";
import { useScopedHref, useUrlState, useWorkspace } from "../workspace";

const STEPS = ["Vehicle", "Audience", "Channels & budget", "Creative", "Review"] as const;
const STATUS_TONE: Record<CampaignStatus, "neutral" | "accent" | "warn" | "danger"> = { Draft: "neutral", Pending: "warn", Approved: "accent", Publishing: "warn", Active: "accent", Pausing: "warn", Paused: "neutral", Failed: "danger", Completed: "neutral" };

export function AdvertisingPage({ campaignId }: { campaignId?: string }) {
  const { state, scope, can, run, mergeRecords } = useWorkspace();
  const url = useUrlState();
  const remote = useRemote<{ campaignVehicles: Vehicle[]; available: Vehicle[] }>(`/api/advertising?branches=${scope.ids.join(",")}`, (d) => mergeRecords({ vehicles: [...d.campaignVehicles, ...d.available] }));
  const href = useScopedHref();
  const toast = useToast();
  const [listOpen, setListOpen] = useState(false);
  const visible = state.campaigns.filter((c) => { const v = state.vehicles.find((x) => x.id === c.vehicleId); return v ? scope.ids.includes(v.branchId) : false; });
  const wanted = url.get("campaign") || campaignId || "";
  const campaign = visible.find((c) => c.id === wanted) ?? visible.find((c) => c.status === "Draft") ?? visible[0];
  const available = state.vehicles.filter((v) => v.status === "available" && scope.ids.includes(v.branchId));

  const startNew = (vehicleId: string) => {
    const r = run((s, a) => createCampaign(s, a, vehicleId));
    if (!r.ok) { toast(r.message, "error"); return; }
    setListOpen(false);
    url.set({ campaign: r.campaign.id, step: 2 });
    toast(`${r.campaign.id} draft created from stock ${vehicleId}.`);
  };

  if (!remote.data && remote.status !== "error") return <div className="page"><PageHead title="Advertising Studio" lead="Loading your campaigns…" /><PanelSkeleton rows={6} title="Advertising Studio" /></div>;
  if (!remote.data) return <div className="page"><PageHead title="Advertising Studio" /><ErrorPanel title="Advertising Studio could not load" onRetry={remote.reload} /></div>;
  if (!campaign) {
    return (
      <div className="page">
        <PageHead title="Advertising Studio" lead="A measurable campaign for one available vehicle." />
        {available.length === 0 ? <EmptyState title="No eligible stock">Only available vehicles can be advertised. Add an available vehicle first. You can still draft creative once stock exists.</EmptyState> : (
          <EmptyState title="Start your first campaign" actions={can("campaign.edit") ? <NewCampaign options={available.map((v) => ({ value: v.id, label: `${v.id} / ${v.make} ${v.model}` }))} onStart={startNew} /> : <p className="muted">Requires Owner, Manager or Marketing access.</p>}>Pick an available vehicle and objective. Nothing spends until the budget is approved and the campaign is published.</EmptyState>
        )}
      </div>
    );
  }
  return (
    <div className="page">
      <Studio key={`${campaign.id}-${campaign.status}`} campaign={campaign} onList={() => setListOpen(true)} />
      <Drawer open={listOpen} onClose={() => setListOpen(false)} size="w480" title="Campaigns" description="Every campaign has one vehicle, one landing URL and a spend cap.">
        <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {visible.map((c) => <li key={c.id} className="card tight"><div className="spread"><div><strong>{c.id} / {c.name}</strong><div className="meta">{c.objective} / {formatRupees(totalBudget(c))} budget</div></div><Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge></div><div className="row-flex mt-2"><Link href={href(`/app/advertising/${c.id}`)} className="btn btn-sm" onClick={() => setListOpen(false)}>Open</Link></div></li>)}
        </ul>
        <hr className="divider" />
        {can("campaign.edit") ? <NewCampaign options={available.map((v) => ({ value: v.id, label: `${v.id} / ${v.make} ${v.model}` }))} onStart={startNew} /> : <p className="meta">Starting a campaign needs Owner, Manager or Marketing access.</p>}
      </Drawer>
    </div>
  );
}

function NewCampaign({ options, onStart }: { options: { value: string; label: string }[]; onStart: (id: string) => void }) {
  const [vehicle, setVehicle] = useState("");
  return (
    <div className="stack" style={{ minWidth: 260 }}>
      <SelectField label="New campaign: available vehicle" value={vehicle} onChange={(e) => setVehicle(e.target.value)} options={options} placeholder="Choose a vehicle" />
      <Button variant="primary" disabled={!vehicle} onClick={() => onStart(vehicle)}>Create draft</Button>
    </div>
  );
}

function Studio({ campaign, onList }: { campaign: Campaign; onList: () => void }) {
  const { state, can, run, queueAck, actor } = useWorkspace();
  const url = useUrlState();
  const href = useScopedHref();
  const toast = useToast();
  const vehicle = state.vehicles.find((v) => v.id === campaign.vehicleId);
  const editable = campaign.status === "Draft";
  const [work, setWork] = useState<Campaign>(campaign);
  useEffect(() => setWork(campaign), [campaign]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const step = Math.min(5, Math.max(1, Number(url.get("step", String(campaign.status === "Draft" ? campaign.step : 5))) || 1));
  const dirty = JSON.stringify(work) !== JSON.stringify(campaign);
  const performance = ["Active", "Paused", "Pausing", "Completed"].includes(campaign.status) && step === 5 && Boolean(campaign.metrics || campaign.status !== "Completed");

  const commit = (): boolean => {
    if (!dirty) return true;
    const r = run((s, a) => updateCampaign(s, a, campaign.id, work));
    if (!r.ok) { toast(r.message, "error"); return false; }
    return true;
  };
  const stepErrors = (n: number): Record<string, string> => {
    const all = validateCampaign(state, work);
    if (n === 1) return all.vehicle ? { vehicle: all.vehicle } : {};
    if (n === 2) return all.dates ? { dates: all.dates } : {};
    if (n === 3) return Object.fromEntries(Object.entries(all).filter(([k]) => ["channels", "totalCap", "dailyCap"].includes(k)));
    if (n === 4) return all.copy ? { copy: all.copy } : {};
    return all;
  };
  const go = (n: number) => {
    if (n > step && editable) {
      for (let i = step; i < n; i += 1) { const e = stepErrors(i); if (Object.keys(e).length) { setErrors(e); return; } }
    }
    setErrors({});
    if (editable) commit();
    url.set({ step: n, campaign: campaign.id });
  };

  const patch = (changes: Partial<Campaign>) => { setWork((w) => ({ ...w, ...changes })); setErrors({}); };
  const setChannel = (id: Campaign["channels"][number]["id"], changes: Partial<Campaign["channels"][number]>) => patch({ channels: work.channels.map((c) => (c.id === id ? { ...c, ...changes } : c)) });
  const canEdit = can("campaign.edit") && editable;
  const total = totalBudget(work);
  const facts = vehicle ? factsFor(vehicle) : [];
  const claimProblems = [...checkCopy(work.headline), ...checkCopy(work.body)];
  const days = vehicle ? stockAgeDays(vehicle, SNAPSHOT_AT) : 0;
  const checks = preflight(state, campaign);
  const metrics = metricsFor(campaign);
  const account = state.integrations.find((i) => i.id === ADVERTISING_ACCOUNT_ID);

  const act = (fn: () => ReturnType<typeof run>, ok: string, afterOk?: () => void) => {
    const r = fn();
    if (!r.ok) { setErrors(r.fields ?? { form: r.message }); toast(r.message, "error"); return; }
    setErrors({});
    toast(ok);
    afterOk?.();
  };

  if (!vehicle) return <EmptyState title="Vehicle missing">The vehicle for this campaign is no longer in your scope.</EmptyState>;

  return (
    <>
      <PageHead title="Advertising Studio" lead="A measurable campaign for one available vehicle."
        actions={<>
          <Button onClick={onList}>Campaigns ({state.campaigns.length})</Button>
          {editable ? <Button variant="primary" className="primary-cta" disabled={!canEdit} reason={!can("campaign.edit") ? "Requires Owner, Manager or Marketing access." : undefined} onClick={() => { if (commit()) toast("Draft saved."); }}>Save draft</Button> : null}
        </>} />
      <div className="steps" role="tablist" aria-label="Campaign workflow">
        {STEPS.map((label, i) => (
          <button key={label} role="tab" type="button" className="tab" id={`step-${i + 1}`} aria-selected={step === i + 1} tabIndex={step === i + 1 ? 0 : -1} onClick={() => go(i + 1)} onKeyDown={(e) => { if (e.key === "ArrowRight") go(Math.min(5, step + 1)); if (e.key === "ArrowLeft") go(Math.max(1, step - 1)); }}>{i + 1} {label}</button>
        ))}
      </div>
      <div className="row-flex" aria-live="polite"><Badge tone={STATUS_TONE[campaign.status]}>{campaign.status}</Badge><span className="meta">{campaign.id} / {campaign.name}{campaign.platformAck === "awaiting" ? " / Awaiting platform acknowledgement: not live until acknowledged" : ""}{dirty ? " / Unsaved changes" : ""}</span></div>
      <FormSummary errors={errors} label="Resolve before continuing:" />

      <div className="studio">
        <Panel title="Selected vehicle" rows={6} partialFail>
          <section className="card studio-col" aria-labelledby="anchor-title">
            <h2 className="h3" id="anchor-title">Selected vehicle</h2>
            <VehicleArt ratio="240 / 160" />
            <div><h3 className="h3">{vehicle.make} {vehicle.model}</h3><p className="muted">{vehicle.year} / {vehicle.id}</p></div>
            <div><div className="price-big" style={{ fontSize: 32 }}>{formatMoney(vehicle.asking)}</div><div className="meta">Asking / current version {vehicle.version}</div></div>
            <div><Badge tone={vehicle.status === "available" ? "accent" : "warn"}>{vehicle.status === "available" ? "Available" : vehicle.status}</Badge></div>
            <p className="muted">{campaign.note ?? `Reason: ${days} days in stock and ${vehicle.enquiries14d} enquiries in 14 days.`}</p>
            <p className="meta">Landing URL: /vehicles/{vehicle.id.toLowerCase()}?cid={campaign.id.toLowerCase()} / vehicle_id preserved in every lead.</p>
            {editable && canEdit ? <ChangeVehicle current={vehicle.id} onChange={(id) => act(() => run((s, a) => changeVehicle(s, a, campaign.id, id)), "Vehicle changed. Evidence and copy refreshed.")} /> : <span className="meta">Vehicle is locked after approval.</span>}
          </section>
        </Panel>

        <Panel title="Plan editor" rows={7} partialFail>
          <section className="card studio-col" aria-labelledby="plan-title">
            {performance ? (
              <Performance campaign={campaign} metrics={metrics} />
            ) : (
              <>
                <h2 className="h3" id="plan-title">{step === 1 ? "Vehicle and objective" : step === 2 ? "Audience" : step === 3 ? "Channels and budget" : step === 4 ? "Creative" : "Review"}</h2>
                {step === 1 ? (
                  <div className="stack">
                    <p className="muted">Only available vehicles are selectable. Choose Enquiries or Test-drive requests; a dedicated vehicle page anchors every lead to {vehicle.id}.</p>
                    <fieldset className="radio-group" disabled={!canEdit}><legend className="label">Objective</legend>
                      {(["Enquiries", "Test-drive requests"] as const).map((o) => <label key={o} className="check"><input type="radio" name="objective" checked={work.objective === o} onChange={() => patch({ objective: o })} /><span>{o}</span></label>)}
                    </fieldset>
                    <Notice role="status">Recommendation evidence: {days} days in stock, {vehicle.enquiries14d} enquiries / 14 days, eligible region {work.region}. {campaign.metrics ? "Connected-channel performance is available." : "No past metrics: labelled Budget experiment. Outcomes are not predicted."}</Notice>
                    {canEdit ? <Button onClick={() => patch({ body: `${vehicle.year} ${vehicle.fuel.toLowerCase()} ${vehicle.transmission.toLowerCase()}. ${formatKm(vehicle.km)} km. Request vehicle details.`, headline: `${vehicle.model} / ${state.branches.find((b) => b.id === vehicle.branchId)?.city}` })}>Generate draft from stock facts</Button> : null}
                  </div>
                ) : null}
                {step === 2 ? (
                  <div className="stack">
                    <p className="muted">{work.region} / eligible audience settings only. Landing URL carries {vehicle.id} and {campaign.id}.</p>
                    <div className="form-grid">
                      <SelectField label="Region" value={work.region.split(" + ")[0]} onChange={(e) => patch({ region: `${e.target.value} + ${work.radiusKm} km` })} options={["Kochi", "Thrissur", "Kozhikode"]} disabled={!canEdit} />
                      <SelectField label="Radius" value={String(work.radiusKm)} onChange={(e) => patch({ radiusKm: Number(e.target.value), region: `${work.region.split(" + ")[0]} + ${e.target.value} km` })} options={[{ value: "20", label: "20 km" }, { value: "40", label: "40 km" }, { value: "80", label: "80 km" }]} disabled={!canEdit} />
                      <TextField label="Start date" type="date" value={work.startDate} onChange={(e) => patch({ startDate: e.target.value })} disabled={!canEdit} error={errors.dates} />
                      <TextField label="End date" type="date" value={work.endDate} onChange={(e) => patch({ endDate: e.target.value })} disabled={!canEdit} />
                    </div>
                    <p className="meta">Audience targeting uses location and vehicle interest only. Sensitive attributes are never used.</p>
                  </div>
                ) : null}
                {step === 3 ? (
                  <div className="stack">
                    <p className="h3">Objective: {work.objective === "Enquiries" ? "vehicle enquiries" : "test-drive requests"}</p>
                    <p className="muted">{work.region} / eligible audience settings only. Landing URL carries {vehicle.id} and {campaign.id}.</p>
                    {CHANNELS.map((ch) => {
                      const status = channelStatus(state, ch.id);
                      const row = work.channels.find((c) => c.id === ch.id)!;
                      return (
                        <div key={ch.id} className={`channel-row ${row.enabled ? "on" : ""}`}>
                          <Check label={<><strong>{ch.name}</strong> <span className="muted">/ {status.connected ? "connected" : "not connected"}</span></>} checked={row.enabled && status.connected} disabled={!canEdit || !status.connected} onChange={(v) => setChannel(ch.id, { enabled: v, budget: v && row.budget === 0 ? rupees(2000) : row.budget })} help={!status.connected ? status.reason : undefined} />
                          {row.enabled && status.connected ? <RupeeField label={`${ch.name} budget`} hideLabel className="channel-budget" align="right" value={String(row.budget / 100)} onChange={(raw) => setChannel(ch.id, { budget: parseRupeeInput(raw) ?? 0 })} disabled={!canEdit} /> : null}
                        </div>
                      );
                    })}
                    {errors.channels ? <div className="field-error" role="alert">{errors.channels}</div> : null}
                    <div className="form-grid">
                      <RupeeField label="Total cap / 30 days" value={String(work.totalCap30d / 100)} onChange={(raw) => patch({ totalCap30d: parseRupeeInput(raw) ?? 0 })} disabled={!canEdit} error={errors.totalCap} help={`Channel budgets total ${formatRupees(total)}.`} />
                      <RupeeField label="Daily cap" value={String(work.dailyCap / 100)} onChange={(raw) => patch({ dailyCap: parseRupeeInput(raw) ?? 0 })} disabled={!canEdit} error={errors.dailyCap} />
                    </div>
                    <p className="muted">No reach or sale forecast. Campaign copy may use verified stock facts only; generated claims need review.</p>
                  </div>
                ) : null}
                {step === 4 ? (
                  <div className="stack">
                    <TextField label="Headline" value={work.headline} onChange={(e) => patch({ headline: e.target.value })} disabled={!canEdit} maxLength={70} />
                    <TextArea label="Body" value={work.body} onChange={(e) => patch({ body: e.target.value })} disabled={!canEdit} error={errors.copy} help="Use verified stock facts only." />
                    {claimProblems.length ? <Notice tone="danger" role="alert">Blocked claim: {claimProblems.join(" ")} Remove it to continue.</Notice> : <Notice role="status">Copy uses stock facts only.</Notice>}
                    <div><span className="label meta">Source chips</span><div className="chip-row mt-2">{facts.map((f) => <span className="chip" key={f.label}>{f.label} <span className="meta">· {f.source}</span></span>)}</div></div>
                  </div>
                ) : null}
                {step === 5 ? <ReviewStep campaign={campaign} work={work} checks={checks} vehicleName={`${vehicle.make} ${vehicle.model}`} /> : null}
                <div className="studio-actions">
                  {step > 1 ? <Button onClick={() => go(step - 1)}>Back</Button> : null}
                  {step < 5 ? <Button variant="primary" className="btn-block" onClick={() => go(step + 1)}>{step === 3 ? "Continue to creative" : step === 4 ? "Continue to review" : "Continue"}</Button> : null}
                  {step === 5 && campaign.status === "Draft" ? <Button variant="primary" onClick={() => { if (!commit()) return; act(() => run((s, a) => submitCampaign(s, a, campaign.id)), "Submitted. Routed to the budget approver. No spend yet."); }} disabled={!can("campaign.edit")} reason={!can("campaign.edit") ? "Requires Owner, Manager or Marketing access." : undefined}>Submit for approval</Button> : null}
                  {step === 5 && campaign.status === "Pending" ? <><Button variant="primary" onClick={() => act(() => run((s, a) => approveCampaign(s, a, campaign.id)), "Approved. Version locked. Approval alone does not spend.")} disabled={!can("campaign.approve") || (state.policy.distinctApprover && campaign.createdBy === actor.sub)} reason={state.policy.distinctApprover && campaign.createdBy === actor.sub ? "Self-approval is prohibited under the default policy. Ask a distinct approver." : !can("campaign.approve") ? "Requires Owner or Manager access." : undefined}>Approve budget and creative</Button><Button onClick={() => { run((s, a) => updateCampaign(s, a, campaign.id, { status: "Draft" } as Partial<Campaign>)); toast("Returned to draft."); }} disabled={!can("campaign.approve")}>Return to draft</Button></> : null}
                  {step === 5 && campaign.status === "Approved" ? <Button variant="primary" onClick={() => act(() => run((s, a) => publishCampaign(s, a, campaign.id)), "Publish requested. Awaiting platform acknowledgement: not live yet.", () => queueAck(campaign.id))} disabled={!can("campaign.edit")}>Publish</Button> : null}
                  {step === 5 && campaign.status === "Active" ? <Button onClick={() => act(() => run((s, a) => pauseCampaign(s, a, campaign.id)), "Pause requested. Pending until the platform acknowledges.", () => queueAck(campaign.id))} disabled={!can("campaign.edit")}>Pause</Button> : null}
                  {step === 5 && campaign.status === "Paused" ? <Button variant="primary" onClick={() => act(() => run((s, a) => resumeCampaign(s, a, campaign.id)), "Resume requested. Stock and dates rechecked.", () => queueAck(campaign.id))} disabled={!can("campaign.edit")}>Resume</Button> : null}
                  {step === 5 && campaign.status === "Draft" && can("campaign.edit") ? <Button variant="danger" onClick={() => { const r = run((s, a) => discardCampaign(s, a, campaign.id)); if (r.ok) { toast("Draft discarded."); url.set({ campaign: null, step: null }); } }}>Discard draft</Button> : null}
                </div>
              </>
            )}
          </section>
        </Panel>

        <section className="card studio-col" aria-labelledby="preview-title">
          <h2 className="h3" id="preview-title">Conceptual ad preview</h2>
          <VehicleArt ratio="280 / 185" label="Conceptual creative / schematic vehicle image" />
          <div><h3 className="h2">{work.headline || MISSING}</h3><p style={{ marginTop: 8 }}>{work.body || MISSING}</p></div>
          <Button variant="primary" className="btn-block" onClick={() => undefined} aria-label="Vehicle details (preview only)">Vehicle details</Button>
          <p className="meta">Budget summary: {formatRupees(total)} of {formatRupees(work.totalCap30d)} cap / {formatRupees(work.dailyCap)} per day. Measure: spend, unique enquiries, qualified leads, test-drive requests and CPL. Attribution: click {work.clickWindowDays} d / view {work.viewWindowDays} d; duplicates removed by tenant, contact and vehicle within the window.</p>
        </section>
      </div>
      <p className="footnote">Publish requires approved creative and budget, connected account, valid tracking and available stock.{account?.state !== "Connected" ? <> Advertising account is {account?.state.toLowerCase()}: <Link className="accent-text" href={href("/app/settings/integrations")}>connect it in Settings</Link>.</> : ""}</p>
    </>
  );
}

function ChangeVehicle({ current, onChange }: { current: string; onChange: (id: string) => void }) {
  const { state, scope } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  const options = state.vehicles.filter((v) => v.status === "available" && scope.ids.includes(v.branchId) && v.id !== current);
  if (!open) return <button type="button" className="link-btn" onClick={() => setOpen(true)}>Change vehicle &gt;</button>;
  return <div className="stack-sm"><SelectField label="Available vehicle" value={pick} onChange={(e) => setPick(e.target.value)} options={options.map((v) => ({ value: v.id, label: `${v.id} / ${v.make} ${v.model}` }))} placeholder="Choose" /><div className="row-flex"><Button size="sm" variant="primary" disabled={!pick} onClick={() => { onChange(pick); setOpen(false); }}>Change</Button><Button size="sm" onClick={() => setOpen(false)}>Cancel</Button></div></div>;
}

function ReviewStep({ campaign, work, checks, vehicleName }: { campaign: Campaign; work: Campaign; checks: ReturnType<typeof preflight>; vehicleName: string }) {
  return (
    <div className="stack">
      <dl className="kv">
        <div><dt>Vehicle</dt><dd>{vehicleName} / {campaign.vehicleId}</dd></div><div><dt>Objective</dt><dd>{work.objective}</dd></div><div><dt>Audience</dt><dd>{work.region}</dd></div><div><dt>Dates</dt><dd>{formatDate(work.startDate)} to {formatDate(work.endDate)}</dd></div>
        <div><dt>Channels</dt><dd>{work.channels.filter((c) => c.enabled).map((c) => `${CHANNELS.find((x) => x.id === c.id)?.name} ${formatRupees(c.budget)}`).join(", ") || MISSING}</dd></div>
        <div><dt>Spend cap</dt><dd>{formatRupees(work.totalCap30d)} / 30 days · {formatRupees(work.dailyCap)} / day</dd></div><div><dt>Tracking</dt><dd>{campaign.utm}</dd></div>
      </dl>
      <div><h3 className="h3">Publish preflight</h3><ul className="preflight">{checks.map((c) => <li key={c.key}><span className={c.passed ? "tone-accent" : "warn-text"}>{c.passed ? "Pass" : "Blocked"}</span> {c.label} <span className="meta">/ {c.detail}</span></li>)}</ul></div>
      <p className="meta">Draft and approved states do not spend. Budget or price changes invalidate approval.</p>
      <h3 className="h3">History</h3>
      <ul className="timeline">{[...campaign.history].reverse().map((h, i) => <li key={i}><strong>{h.action}</strong><span className="meta">{h.actor} / {formatDateTime(h.at)}</span></li>)}</ul>
    </div>
  );
}

function Performance({ campaign, metrics }: { campaign: Campaign; metrics: ReturnType<typeof metricsFor> }) {
  return (
    <div className="stack">
      <h2 className="h3" id="plan-title">Performance / {campaign.id}</h2>
      {!metrics ? <Notice tone="warn" role="status">Metrics unavailable. They are reported as unavailable, never as zero, until the platform returns data.</Notice> : (
        <>
          <p className="meta">{campaign.status === "Completed" ? "Completed historical test. " : ""}Attribution: click {campaign.clickWindowDays} d / view {campaign.viewWindowDays} d. Leads are unique after duplicate handling. No sale inference.</p>
          <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            <Kpi label="Spend" value={formatRupees(metrics.spend)} tone="neutral" />
            <Kpi label="Unique attributed leads" value={metrics.leads} tone="neutral" />
            <Kpi label="CPL" value={formatRupees(metrics.cpl)} tone="neutral" />
          </div>
          <dl className="kv"><div><dt>Clicks</dt><dd>{metrics.clicks}</dd></div><div><dt>Qualified leads</dt><dd>{metrics.qualified}</dd></div><div><dt>Test-drive requests</dt><dd>{metrics.testDrives}</dd></div><div><dt>Cost per qualified lead</dt><dd>{formatRupees(metrics.costPerQualified)}</dd></div></dl>
          <div className="table-wrap fit"><table className="data-table dense"><thead><tr><th>Channel</th><th className="num">Spend</th><th className="num">Clicks</th><th className="num">Leads</th></tr></thead><tbody>{metrics.byChannel.map((c) => <tr key={c.channel}><td>{c.channel}</td><td className="num">{formatRupees(c.spend)}</td><td className="num">{c.clicks}</td><td className="num">{c.leads}</td></tr>)}</tbody></table></div>
          <div><h3 className="h3">Daily spend (₹)</h3><SpendLine data={metrics.daily.map((d) => ({ label: d.date.slice(5), value: d.spend / 100 }))} format={(v) => `₹${v}`} /></div>
        </>
      )}
      {campaign.status === "Pausing" ? <Notice tone="warn" role="status">Pause requested: pending until the platform acknowledges. Delivery may continue until then.</Notice> : null}
    </div>
  );
}
