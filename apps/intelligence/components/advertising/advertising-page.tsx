"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { approveCampaign, ADVERTISING_ACCOUNT_ID, CHANNELS, changeVehicle, channelStatus, checkCopy, createCampaign, discardCampaign, factsFor, metricsFor, pauseCampaign, preflight, publishCampaign, resumeCampaign, submitCampaign, totalBudget, updateCampaign, validateCampaign } from "@/lib/actions";
import type { Campaign, CampaignStatus, Vehicle } from "@/lib/domain";
import { formatDate, formatDateTime, formatKm, formatMoney, formatRupees, parseRupeeInput, rupees } from "@/lib/format";
import { stockAgeDays } from "@/lib/finance";
import { SNAPSHOT_AT } from "@/lib/time";
import { SpendLine } from "../charts-lazy";
import { Drawer } from "../overlay";
import { Panel } from "../panel";
import { useRemote } from "../use-remote";
import { useToast } from "../toast";
import { Badge, Button, Check, EmptyState, ErrorPanel, FormSummary, Kpi, Notice, PageHead, PanelSkeleton, RupeeField, SelectField, Tabs, TextArea, TextField } from "../ui";
import { VehicleArt } from "../vehicle-art";
import { SocialPostKit } from "./social-post-kit";
import { AdAccounts } from "./ad-accounts";
import { PlansView } from "./plans-view";
import { listingPath } from "@/lib/social-post";
import { useScopedHref, useUrlState, useWorkspace } from "../workspace";

const STEPS = ["Car", "Audience", "Budget", "Ad text", "Review"] as const;
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

  const plansTabs = <Tabs label="Advertising" idPrefix="adtop" value={url.get("view") === "plans" ? "plans" : "campaigns"} onChange={(v) => url.set({ view: v === "plans" ? "plans" : null })} tabs={[{ value: "campaigns", label: visible.length ? "Campaign" : "Campaigns" }, { value: "plans", label: "Plans per car" }]} />;
  if (remote.data && url.get("view") === "plans") {
    return <div className="page"><PageHead title="Advertising" lead="Ads and social posts for the cars you want to sell." />{plansTabs}<PlansView vehicles={available} /></div>;
  }
  if (!remote.data && remote.status !== "error") return <div className="page"><PageHead title="Advertising" lead="Loading your campaigns…" /><PanelSkeleton rows={6} title="Advertising" /></div>;
  if (!remote.data) return <div className="page"><PageHead title="Advertising" /><ErrorPanel title="Advertising could not load" onRetry={remote.reload} /></div>;
  if (!campaign) {
    return (
      <div className="page">
        <PageHead title="Advertising" lead="Ads and social posts for the cars you want to sell." />
        {plansTabs}
        {state.live ? <AdAccounts /> : null}
        {available.length === 0 ? <EmptyState title="No cars on sale yet">Only cars that are on sale can be advertised. Put a car on sale in Inventory, then come back.</EmptyState> : (
          <section className="card ads-start">
            <div className="ads-start-copy"><h2 className="h3">Start a campaign</h2><p className="muted">Choose a car on sale. You set the audience and budget next. Nothing is spent until the budget is approved and the ad is published.</p></div>
            {can("campaign.edit") ? <NewCampaign options={available.map((v) => ({ value: v.id, label: `${v.year} ${v.make} ${v.model} · ${v.id}` }))} onStart={startNew} /> : <p className="muted">Needs Owner, Manager or Marketing access.</p>}
          </section>
        )}
      </div>
    );
  }
  return (
    <div className="page">
      <Studio key={`${campaign.id}-${campaign.status}`} campaign={campaign} onList={() => setListOpen(true)} />
      <Drawer open={listOpen} onClose={() => setListOpen(false)} size="w480" title="Campaigns" description="Each campaign advertises one car, with its own link and spend limit.">
        <ul className="stack" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {visible.map((c) => <li key={c.id} className="card tight"><div className="spread"><div><strong>{c.name}</strong><div className="meta">{[c.id, c.objective, `${formatRupees(totalBudget(c))} budget`].join(" · ")}</div></div><Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge></div><div className="row-flex mt-2"><Link href={href(`/app/advertising/${c.id}`)} className="btn btn-sm" onClick={() => setListOpen(false)}>Open</Link></div></li>)}
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
    <div className="ads-new">
      <SelectField label="Car to advertise" value={vehicle} onChange={(e) => setVehicle(e.target.value)} options={options} placeholder="Choose a car" />
      <Button variant="primary" disabled={!vehicle} onClick={() => onStart(vehicle)}>Create draft</Button>
    </div>
  );
}

function Studio({ campaign, onList }: { campaign: Campaign; onList: () => void }) {
  const { state, can, run, queueAck, actor, refresh } = useWorkspace();
  const [launching, setLaunching] = useState(false);
  /** Live workspaces publish on the real platforms; the campaign changes only from what they confirm. */
  const launch = async (action: "publish" | "pause" | "resume") => {
    setLaunching(true);
    try {
      const r = await fetch("/api/advertising/launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ campaignId: campaign.id, action }) });
      const body = await r.json().catch(() => ({}));
      toast(r.ok ? body.message : body?.error?.message ?? "That did not work. Try again.", r.ok ? undefined : "error");
    } catch { toast("We could not reach the server. Try again.", "error"); }
    await refresh();
    setLaunching(false);
  };
  const url = useUrlState();
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

  if (!vehicle) return <EmptyState title="Car not found">The car for this campaign is no longer in your branches.</EmptyState>;
  const view = url.get("view") === "social" ? "social" : "campaign";
  const photo = vehicle.photos?.[0];
  const city = state.branches.find((b) => b.id === vehicle.branchId)?.city;

  const carPanel = (
    <section className="card ads-car" aria-labelledby="ads-car-title">
      <div className="ads-car-media">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" loading="lazy" decoding="async" />
        ) : <VehicleArt ratio="16 / 10" />}
      </div>
      <div className="ads-car-body">
        <div className="spread"><h2 className="h3" id="ads-car-title">{vehicle.year} {vehicle.make} {vehicle.model}</h2><Badge tone={vehicle.status === "available" ? "accent" : "warn"}>{vehicle.status === "available" ? "On sale" : vehicle.status}</Badge></div>
        <span className="meta">{[vehicle.id, vehicle.variant, `${formatKm(vehicle.km)} km`].filter(Boolean).join(" · ")}</span>
        <strong className="ads-price">{formatMoney(vehicle.asking)}</strong>
        <span className="meta">{days} days in stock · {vehicle.enquiries14d} enquir{vehicle.enquiries14d === 1 ? "y" : "ies"} in the last 14 days</span>
        {editable && canEdit ? <ChangeVehicle current={vehicle.id} onChange={(id) => act(() => run((s, a) => changeVehicle(s, a, campaign.id, id)), "Car changed. Ad text refreshed from its details.")} /> : <span className="meta">The car is locked once the campaign is approved.</span>}
      </div>
    </section>
  );

  return (
    <>
      <PageHead title="Advertising" lead="Ads and social posts for the cars you want to sell."
        actions={<>
          <Button onClick={onList}>Campaigns ({state.campaigns.length})</Button>
          {editable && view === "campaign" ? <Button variant="primary" className="primary-cta" disabled={!canEdit} reason={!can("campaign.edit") ? "Requires Owner, Manager or Marketing access." : undefined} onClick={() => { if (commit()) toast("Draft saved."); }}>Save draft</Button> : null}
        </>} />
      {state.live && view === "campaign" ? <AdAccounts /> : null}
      <Tabs label="Advertising" idPrefix="ads" value={view} onChange={(v) => url.set({ view: v === "campaign" ? null : v, campaign: v === "plans" ? null : campaign.id })} tabs={[{ value: "campaign", label: "Campaign" }, { value: "social", label: "Social posts" }, { value: "plans", label: "Plans per car" }]} />

      {view === "social" ? (
        <SocialPostKit vehicle={vehicle} campaign={work} />
      ) : (
        <>
          <div className="ads-status" aria-live="polite"><Badge tone={STATUS_TONE[campaign.status]}>{campaign.status}</Badge><span className="meta">{[campaign.id, campaign.name, campaign.platformAck === "awaiting" ? "Waiting for the ad platform to confirm: not live yet" : "", dirty ? "Unsaved changes" : ""].filter(Boolean).join(" · ")}</span></div>
          <div className="steps" role="tablist" aria-label="Campaign steps">
            {STEPS.map((label, i) => (
              <button key={label} role="tab" type="button" className="tab" id={`step-${i + 1}`} aria-selected={step === i + 1} tabIndex={step === i + 1 ? 0 : -1} onClick={() => go(i + 1)} onKeyDown={(e) => { if (e.key === "ArrowRight") go(Math.min(5, step + 1)); if (e.key === "ArrowLeft") go(Math.max(1, step - 1)); }}><span className="step-num" aria-hidden="true">{i + 1}</span>{label}</button>
            ))}
          </div>
          <FormSummary errors={errors} label="Fix these to continue:" />

          <div className="ads-layout">
            <Panel title="Campaign" rows={7} partialFail>
              <section className="card ads-main" aria-labelledby="plan-title">
                {performance ? (
                  <Performance campaign={campaign} metrics={metrics} />
                ) : (
                  <>
                    <h2 className="h3" id="plan-title">{step === 1 ? "What should the ad do?" : step === 2 ? "Who should see it?" : step === 3 ? "Where and how much?" : step === 4 ? "Ad text" : "Review and submit"}</h2>
                    {step === 1 ? (
                      <div className="stack">
                        <fieldset className="radio-group" disabled={!canEdit}><legend className="label">Goal</legend>
                          {(["Enquiries", "Test-drive requests"] as const).map((o) => <label key={o} className="check"><input type="radio" name="objective" checked={work.objective === o} onChange={() => patch({ objective: o })} /><span>{o}</span></label>)}
                        </fieldset>
                        <p className="meta">Every enquiry from this ad is linked to {vehicle.id}. {campaign.metrics ? "Past results from connected channels are shown on Review." : "There are no past results to predict from, so treat the first budget as a test."}</p>
                        {canEdit ? <div><Button onClick={() => patch({ body: `${vehicle.year} ${vehicle.fuel.toLowerCase()} ${vehicle.transmission.toLowerCase()}. ${formatKm(vehicle.km)} km. Request vehicle details.`, headline: `${vehicle.model} / ${city}` })}>Write ad text from the car&apos;s details</Button></div> : null}
                      </div>
                    ) : null}
                    {step === 2 ? (
                      <div className="stack">
                        <div className="form-grid">
                          <SelectField label="Area" value={work.region.split(" + ")[0]} onChange={(e) => patch({ region: `${e.target.value} + ${work.radiusKm} km` })} options={["Kochi", "Thrissur", "Kozhikode"]} disabled={!canEdit} />
                          <SelectField label="Distance" value={String(work.radiusKm)} onChange={(e) => patch({ radiusKm: Number(e.target.value), region: `${work.region.split(" + ")[0]} + ${e.target.value} km` })} options={[{ value: "20", label: "Within 20 km" }, { value: "40", label: "Within 40 km" }, { value: "80", label: "Within 80 km" }]} disabled={!canEdit} />
                          <TextField label="Starts" type="date" value={work.startDate} onChange={(e) => patch({ startDate: e.target.value })} disabled={!canEdit} error={errors.dates} />
                          <TextField label="Ends" type="date" value={work.endDate} onChange={(e) => patch({ endDate: e.target.value })} disabled={!canEdit} />
                        </div>
                        <p className="meta">Targeting uses location and interest in this kind of car only. Sensitive details such as age, religion or health are never used.</p>
                      </div>
                    ) : null}
                    {step === 3 ? (
                      <div className="stack">
                        <div className="stack-sm">
                          {CHANNELS.map((ch) => {
                            const status = channelStatus(state, ch.id);
                            const row = work.channels.find((c) => c.id === ch.id)!;
                            return (
                              <div key={ch.id} className={`channel-row ${row.enabled ? "on" : ""}`}>
                                <Check label={<><strong>{ch.name}</strong> <span className="muted">· {status.connected ? "connected" : "not connected"}</span></>} checked={row.enabled && status.connected} disabled={!canEdit || !status.connected} onChange={(v) => setChannel(ch.id, { enabled: v, budget: v && row.budget === 0 ? rupees(2000) : row.budget })} help={!status.connected ? status.reason : undefined} />
                                {row.enabled && status.connected ? <RupeeField label={`${ch.name} budget`} hideLabel className="channel-budget" align="right" value={String(row.budget / 100)} onChange={(raw) => setChannel(ch.id, { budget: parseRupeeInput(raw) ?? 0 })} disabled={!canEdit} /> : null}
                              </div>
                            );
                          })}
                        </div>
                        {errors.channels ? <div className="field-error" role="alert">{errors.channels}</div> : null}
                        <div className="form-grid">
                          <RupeeField label="Spend limit for 30 days" value={String(work.totalCap30d / 100)} onChange={(raw) => patch({ totalCap30d: parseRupeeInput(raw) ?? 0 })} disabled={!canEdit} error={errors.totalCap} help={`Channels add up to ${formatRupees(total)}.`} />
                          <RupeeField label="Daily limit" value={String(work.dailyCap / 100)} onChange={(raw) => patch({ dailyCap: parseRupeeInput(raw) ?? 0 })} disabled={!canEdit} error={errors.dailyCap} />
                        </div>
                        <p className="meta">No reach or sales forecast is shown: there is no data to base one on yet.</p>
                      </div>
                    ) : null}
                    {step === 4 ? (
                      <div className="stack">
                        <TextField label="Headline" value={work.headline} onChange={(e) => patch({ headline: e.target.value })} disabled={!canEdit} maxLength={70} />
                        <TextArea label="Text" value={work.body} onChange={(e) => patch({ body: e.target.value })} disabled={!canEdit} error={errors.copy} help="Only facts from the stock record. Claims we cannot check, such as 'best price', are blocked." />
                        {claimProblems.length ? <Notice tone="danger" role="alert">Remove this to continue: {claimProblems.join(" ")}</Notice> : null}
                        <div><span className="label">Facts you can use</span><div className="chip-row mt-2">{facts.map((f) => <span className="chip" key={f.label}>{f.label}</span>)}</div></div>
                        <p className="meta">Posting on Instagram, Facebook or WhatsApp yourself? <button type="button" className="link-btn" onClick={() => url.set({ view: "social", campaign: campaign.id })}>Make social posts</button> from this car.</p>
                      </div>
                    ) : null}
                    {step === 5 ? <ReviewStep campaign={campaign} work={work} checks={checks} vehicleName={`${vehicle.make} ${vehicle.model}`} link={`${listingPath(state.tenant.id, vehicle.id)}?utm_campaign=${campaign.utm}`} accountNote={account?.state !== "Connected" ? <>No advertising account is connected yet. Connect Google Ads or Facebook at the top of this page.</> : null} /> : null}
                    <div className="ads-actions">
                      {step > 1 ? <Button onClick={() => go(step - 1)}>Back</Button> : <span />}
                      <div className="row-flex">
                        {step === 5 && campaign.status === "Draft" && can("campaign.edit") ? <Button variant="danger" onClick={() => { const r = run((s, a) => discardCampaign(s, a, campaign.id)); if (r.ok) { toast("Draft discarded."); url.set({ campaign: null, step: null }); } }}>Discard draft</Button> : null}
                        {step < 5 ? <Button variant="primary" onClick={() => go(step + 1)}>Next: {STEPS[step]}</Button> : null}
                        {step === 5 && campaign.status === "Draft" ? <Button variant="primary" onClick={() => { if (!commit()) return; act(() => run((s, a) => submitCampaign(s, a, campaign.id)), "Submitted for approval. Nothing is spent yet."); }} disabled={!can("campaign.edit")} reason={!can("campaign.edit") ? "Requires Owner, Manager or Marketing access." : undefined}>Submit for approval</Button> : null}
                        {step === 5 && campaign.status === "Pending" ? <><Button onClick={() => { run((s, a) => updateCampaign(s, a, campaign.id, { status: "Draft" } as Partial<Campaign>)); toast("Returned to draft."); }} disabled={!can("campaign.approve")}>Return to draft</Button><Button variant="primary" onClick={() => act(() => run((s, a) => approveCampaign(s, a, campaign.id)), "Approved. Approval alone does not spend.")} disabled={!can("campaign.approve") || (state.policy.distinctApprover && campaign.createdBy === actor.sub)} reason={state.policy.distinctApprover && campaign.createdBy === actor.sub ? "Someone other than the creator must approve." : !can("campaign.approve") ? "Requires Owner or Manager access." : undefined}>Approve budget and ad</Button></> : null}
                        {step === 5 && campaign.status === "Approved" && state.live ? <Button variant="primary" loading={launching} loadingLabel="Publishing" onClick={() => launch("publish")} disabled={!can("campaign.edit")}>Publish</Button> : null}
                        {step === 5 && campaign.status === "Active" && state.live ? <Button loading={launching} onClick={() => launch("pause")} disabled={!can("campaign.edit")}>Pause</Button> : null}
                        {step === 5 && campaign.status === "Paused" && state.live ? <Button variant="primary" loading={launching} onClick={() => launch("resume")} disabled={!can("campaign.edit")}>Resume</Button> : null}
                        {step === 5 && campaign.status === "Approved" && !state.live ? <Button variant="primary" onClick={() => act(() => run((s, a) => publishCampaign(s, a, campaign.id)), "Publish requested. Not live until the platform confirms.", () => queueAck(campaign.id))} disabled={!can("campaign.edit")}>Publish</Button> : null}
                        {step === 5 && campaign.status === "Active" && !state.live ? <Button onClick={() => act(() => run((s, a) => pauseCampaign(s, a, campaign.id)), "Pause requested. Waiting for the platform to confirm.", () => queueAck(campaign.id))} disabled={!can("campaign.edit")}>Pause</Button> : null}
                        {step === 5 && campaign.status === "Paused" && !state.live ? <Button variant="primary" onClick={() => act(() => run((s, a) => resumeCampaign(s, a, campaign.id)), "Resume requested. Stock and dates checked again.", () => queueAck(campaign.id))} disabled={!can("campaign.edit")}>Resume</Button> : null}
                      </div>
                    </div>
                  </>
                )}
              </section>
            </Panel>

            <aside className="ads-side" aria-label="Car and ad preview">
              {carPanel}
              <section className="card ads-preview" aria-labelledby="preview-title">
                <h2 className="ads-preview-label" id="preview-title">Ad preview</h2>
                <p className="ads-preview-head">{work.headline || "Your headline"}</p>
                <p className="ads-preview-body">{work.body || "Your ad text appears here."}</p>
                <span className="btn btn-primary btn-sm ads-preview-cta" aria-hidden="true">{work.objective === "Test-drive requests" ? "Book a test drive" : "See this car"}</span>
                <p className="meta">Budget {formatRupees(total)} of a {formatRupees(work.totalCap30d)} limit · up to {formatRupees(work.dailyCap)} a day</p>
              </section>
            </aside>
          </div>
        </>
      )}
    </>
  );
}

function ChangeVehicle({ current, onChange }: { current: string; onChange: (id: string) => void }) {
  const { state, scope } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  const options = state.vehicles.filter((v) => v.status === "available" && scope.ids.includes(v.branchId) && v.id !== current);
  if (!open) return <button type="button" className="link-btn ads-change" onClick={() => setOpen(true)}>Change car</button>;
  return <div className="stack-sm"><SelectField label="Car on sale" value={pick} onChange={(e) => setPick(e.target.value)} options={options.map((v) => ({ value: v.id, label: `${v.year} ${v.make} ${v.model} · ${v.id}` }))} placeholder="Choose" /><div className="row-flex"><Button size="sm" variant="primary" disabled={!pick} onClick={() => { onChange(pick); setOpen(false); }}>Change</Button><Button size="sm" onClick={() => setOpen(false)}>Cancel</Button></div></div>;
}

function ReviewStep({ campaign, work, checks, vehicleName, link, accountNote }: { campaign: Campaign; work: Campaign; checks: ReturnType<typeof preflight>; vehicleName: string; link: string; accountNote: React.ReactNode }) {
  return (
    <div className="stack">
      <dl className="kv">
        <div><dt>Car</dt><dd>{vehicleName} · {campaign.vehicleId}</dd></div><div><dt>Goal</dt><dd>{work.objective}</dd></div><div><dt>Audience</dt><dd>{work.region}</dd></div><div><dt>Dates</dt><dd>{formatDate(work.startDate)} to {formatDate(work.endDate)}</dd></div>
        <div><dt>Channels</dt><dd>{work.channels.filter((c) => c.enabled).map((c) => `${CHANNELS.find((x) => x.id === c.id)?.name} ${formatRupees(c.budget)}`).join(", ") || "None chosen"}</dd></div>
        <div><dt>Spend limit</dt><dd>{formatRupees(work.totalCap30d)} for 30 days · {formatRupees(work.dailyCap)} a day</dd></div>
        <div><dt>Ad link</dt><dd className="ads-link">{link}</dd></div>
      </dl>
      <div><h3 className="h3">Before it can go live</h3><ul className="preflight">{checks.map((c) => <li key={c.key}><Badge tone={c.passed ? "accent" : "warn"}>{c.passed ? "Ready" : "Not yet"}</Badge> <span>{c.label}</span> <span className="meta">· {c.detail}</span></li>)}</ul></div>
      {accountNote ? <Notice tone="warn" role="status">{accountNote}</Notice> : null}
      <p className="meta">Drafts and approved campaigns never spend. Changing the budget or the car&apos;s price needs approval again.</p>
      <h3 className="h3">History</h3>
      <ul className="timeline">{[...campaign.history].reverse().map((h, i) => <li key={i}><strong>{h.action}</strong><span className="meta">{h.actor} · {formatDateTime(h.at)}</span></li>)}</ul>
    </div>
  );
}

function Performance({ campaign, metrics }: { campaign: Campaign; metrics: ReturnType<typeof metricsFor> }) {
  return (
    <div className="stack">
      <h2 className="h3" id="plan-title">Results · {campaign.id}</h2>
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
