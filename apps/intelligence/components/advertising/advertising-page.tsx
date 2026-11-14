"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { approveCampaign, channelStatus, createCampaign, metricsFor, pauseCampaign, publishCampaign, resumeCampaign, submitCampaign, totalBudget, updateCampaign, withdrawCampaign } from "@/lib/actions";
import type { Campaign, CampaignStatus, Vehicle } from "@/lib/domain";
import { formatDate, formatDateTime, formatKm, formatMoney, formatRupees, rupees } from "@/lib/format";
import { stockAgeDays } from "@/lib/finance";
import { recommendPlan } from "@/lib/marketing-plan";
import { listingPath } from "@/lib/social-post";
import { SNAPSHOT_AT } from "@/lib/time";
import { SpendLine } from "../charts-lazy";
import { Drawer } from "../overlay";
import { useRemote } from "../use-remote";
import { useToast } from "../toast";
import { Badge, Button, EmptyState, ErrorPanel, Kpi, Notice, PageHead, PanelSkeleton, Tabs } from "../ui";
import { VehicleArt } from "../vehicle-art";
import { useScopedHref, useUrlState, useWorkspace } from "../workspace";
import { ConnectionsHub, PlatformMark, usePlatforms } from "./connections-hub";
import { SocialPostKit } from "./social-post-kit";

const STATUS_TONE: Record<CampaignStatus, "neutral" | "accent" | "warn" | "danger"> = { Draft: "neutral", Pending: "warn", Approved: "accent", Publishing: "warn", Active: "accent", Pausing: "warn", Paused: "neutral", Failed: "danger", Completed: "neutral" };
const STATUS_WORD: Record<CampaignStatus, string> = { Draft: "Draft", Pending: "Waiting for approval", Approved: "Approved, not live yet", Publishing: "Going live", Active: "Live", Pausing: "Pausing", Paused: "Paused", Failed: "Failed", Completed: "Finished" };
const LIVE: CampaignStatus[] = ["Pending", "Approved", "Publishing", "Active", "Pausing", "Paused", "Failed"];
type AdChannel = "search" | "meta";

/**
 * Advertising, with nothing to fill in. Accounts are connected once at the top. Each car on sale has a Promote button: the
 * audience, dates, budget, platform split and ad text all come from the car's own record and plan, and the owner just confirms.
 * Spend rules still apply: a campaign is approved by someone allowed to approve it before anything can spend.
 */
export function AdvertisingPage({ campaignId }: { campaignId?: string }) {
  const { state, scope, mergeRecords } = useWorkspace();
  const url = useUrlState();
  const remote = useRemote<{ campaignVehicles: Vehicle[]; available: Vehicle[] }>(`/api/advertising?branches=${scope.ids.join(",")}`, (d) => mergeRecords({ vehicles: [...new Map([...d.campaignVehicles, ...d.available].map((v) => [v.id, v])).values()] }));
  const platforms = usePlatforms();
  const visible = state.campaigns.filter((c) => { const v = state.vehicles.find((x) => x.id === c.vehicleId); return v ? scope.ids.includes(v.branchId) : false; });
  const opened = visible.find((c) => c.id === (url.get("campaign") || campaignId || ""));
  const [promoting, setPromoting] = useState<Vehicle | null>(null);

  if (!remote.data && remote.status !== "error") return <div className="page"><PageHead title="Advertising" lead="Loading…" /><PanelSkeleton rows={6} title="Advertising" /></div>;
  if (!remote.data) return <div className="page"><PageHead title="Advertising" /><ErrorPanel title="Advertising could not load" onRetry={remote.reload} /></div>;
  if (opened) return <div className="page"><CampaignView campaign={opened} /></div>;

  const available = state.vehicles.filter((v) => v.status === "available" && scope.ids.includes(v.branchId));
  const running = visible.filter((c) => LIVE.includes(c.status));
  const tab = url.get("view") === "campaigns" ? "campaigns" : "promote";
  return (
    <div className="page">
      <PageHead title="Advertising" lead="Connect your accounts once. Then promote any car in one tap: the audience, budget and ad are made from the car itself." />
      <ConnectionsHub remote={platforms} />
      <Tabs label="Advertising" idPrefix="ads" value={tab} onChange={(v) => url.set({ view: v === "promote" ? null : v })}
        tabs={[{ value: "promote", label: "Promote a car" }, { value: "campaigns", label: "Campaigns", count: running.length || undefined }]} />
      {tab === "campaigns" ? <CampaignList campaigns={visible} /> : (
        available.length === 0 ? <EmptyState title="No cars on sale yet">Only cars that are on sale can be promoted. Put a car on sale in Inventory, then come back.</EmptyState> : (
          <ul className="promo-grid">
            {available.map((v) => {
              const current = visible.find((c) => c.vehicleId === v.id && LIVE.includes(c.status));
              return <PromoCard key={v.id} vehicle={v} campaign={current} onPromote={() => setPromoting(v)} />;
            })}
          </ul>
        )
      )}
      {promoting ? <PromoteSheet vehicle={promoting} connected={platforms.data?.platforms ?? null} onClose={() => setPromoting(null)} /> : null}
    </div>
  );
}

function PromoCard({ vehicle: v, campaign, onPromote }: { vehicle: Vehicle; campaign?: Campaign; onPromote: () => void }) {
  const { can } = useWorkspace();
  const href = useScopedHref();
  const days = stockAgeDays(v, SNAPSHOT_AT);
  const photo = v.photos?.[0];
  return (
    <li className="card promo-card">
      <div className="promo-media">
        {photo ? <img src={photo} alt="" loading="lazy" decoding="async" /> /* eslint-disable-line @next/next/no-img-element */ : <VehicleArt ratio="16 / 10" />}
        {campaign ? <span className={`promo-flag tone-${STATUS_TONE[campaign.status]}`}>{STATUS_WORD[campaign.status]}</span> : null}
      </div>
      <div className="promo-body">
        <strong>{v.year} {v.make} {v.model}</strong>
        <span className="meta">{[v.variant, `${formatKm(v.km)} km`, v.fuel].filter(Boolean).join(" · ")}</span>
        <span className="promo-price">{formatMoney(v.asking)}</span>
        <span className="meta">{days} days in stock · {v.enquiries14d} enquir{v.enquiries14d === 1 ? "y" : "ies"} in 14 days</span>
      </div>
      <div className="promo-actions">
        {campaign ? <Link className="btn btn-sm" href={href(`/app/advertising/${campaign.id}`)}>View campaign</Link>
          : <Button variant="primary" size="sm" onClick={onPromote} disabled={!can("campaign.edit")} reason={!can("campaign.edit") ? "Needs Owner, Manager or Marketing access." : undefined}>Promote</Button>}
      </div>
    </li>
  );
}

/** Everything is decided from the car; the owner can switch a platform off or pick a lighter or bigger budget, then confirm. */
function PromoteSheet({ vehicle, connected, onClose }: { vehicle: Vehicle; connected: { id: string; connected: boolean }[] | null; onClose: () => void }) {
  const { state, runConfirmed, can, refresh } = useWorkspace();
  const toast = useToast();
  const href = useScopedHref();
  const url = useUrlState();
  const city = state.branches.find((b) => b.id === vehicle.branchId)?.city ?? "";
  const plan = useMemo(() => recommendPlan({ vehicle, city, daysInStock: stockAgeDays(vehicle, SNAPSHOT_AT) }), [vehicle, city]);
  const isOn = (id: string) => connected?.find((p) => p.id === id)?.connected ?? false;
  const reachable: Record<AdChannel, boolean> = { search: channelStatus(state, "search").connected, meta: channelStatus(state, "meta").connected };
  const [channels, setChannels] = useState<Record<AdChannel, boolean>>({ search: reachable.search, meta: reachable.meta });
  const presets = [
    { id: "light", label: "Light", total: Math.max(rupees(3000), Math.round(plan.budget.total30 / 2)), note: "A quiet test" },
    { id: "plan", label: "Recommended", total: plan.budget.total30, note: plan.budget.why },
    { id: "boost", label: "Boost", total: plan.budget.total30 * 2, note: "Sell faster, reach more people" },
  ];
  const [preset, setPreset] = useState("plan");
  const total = presets.find((p) => p.id === preset)!.total;
  const [busy, setBusy] = useState(false);
  const chosen = (Object.keys(channels) as AdChannel[]).filter((c) => channels[c] && reachable[c]);
  const share = (c: AdChannel) => {
    const planShare = (id: AdChannel) => plan.channels.find((x) => x.id === id)?.share ?? 50;
    const sum = chosen.reduce((a, id) => a + planShare(id), 0) || 1;
    return chosen.includes(c) ? planShare(c) / sum : 0;
  };
  const selfApprove = can("campaign.approve") && !state.policy.distinctApprover;
  const link = `${listingPath(state.tenant.id, vehicle.id)}`;

  const launch = async () => {
    if (!chosen.length) return;
    setBusy(true);
    let id = "";
    const { result, confirmed } = runConfirmed((s, a) => {
      const created = createCampaign(s, a, vehicle.id, true);
      if (!created.ok) return created;
      id = created.campaign.id;
      const split = created.campaign.channels.map((ch) => (ch.id === "search" || ch.id === "meta") ? { ...ch, enabled: chosen.includes(ch.id), budget: Math.round(total * share(ch.id)) } : { ...ch, enabled: false, budget: 0 });
      const daily = Math.min(total, Math.max(rupees(100), Math.round((total / 30) * 1.5)));
      const updated = updateCampaign(created.state, a, id, { channels: split, totalCap30d: total, dailyCap: daily, step: 5 });
      if (!updated.ok) return updated;
      const submitted = submitCampaign(updated.state, a, id);
      if (!submitted.ok || !selfApprove) return submitted;
      return approveCampaign(submitted.state, a, id);
    });
    if (!result.ok) { setBusy(false); toast(result.message, "error"); return; }
    const saved = await confirmed;
    if (state.live && !saved.saved) { setBusy(false); toast("The campaign could not be saved. Try again.", "error"); return; }
    if (selfApprove && state.live) {
      const r = await fetch("/api/advertising/launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ campaignId: id, action: "publish" }) }).catch(() => null);
      const body = await r?.json().catch(() => ({}));
      toast(r?.ok ? body.message : body?.error?.message ?? "Saved and approved, but it did not go live. Open the campaign to try again.", r?.ok ? undefined : "error");
      await refresh();
    } else {
      toast(selfApprove ? "Approved. In the sample workspace nothing is published." : "Sent for approval. Nothing is spent until someone with approval rights confirms it.");
    }
    setBusy(false);
    onClose();
    url.set({ campaign: id, view: null });
  };

  const platformRow = (id: AdChannel, label: React.ReactNode, marks: ("facebook" | "instagram" | "google" | "youtube")[], note: string) => (
    <label className={`promo-platform ${channels[id] && reachable[id] ? "is-on" : ""} ${!reachable[id] ? "is-off" : ""}`}>
      <input type="checkbox" checked={channels[id] && reachable[id]} disabled={!reachable[id] || busy} onChange={(e) => setChannels((c) => ({ ...c, [id]: e.target.checked }))} />
      <span className="promo-marks">{marks.map((m) => <PlatformMark key={m} id={m} size={28} />)}</span>
      <span className="promo-platform-text"><strong>{label}</strong><span className="meta">{reachable[id] ? `${note}${chosen.includes(id) ? ` · ${formatRupees(Math.round(total * share(id)))}` : ""}` : "Not connected. Connect it at the top of Advertising."}</span></span>
    </label>
  );

  return (
    <Drawer open onClose={busy ? () => undefined : onClose} size="w560" title={`Promote ${vehicle.year} ${vehicle.make} ${vehicle.model}`}
      description={`Made from the car: ${plan.segmentLabel.toLowerCase()} buyers within ${plan.audience.radiusKm} km of ${plan.audience.area || city}, for 30 days.`}
      footer={<>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" loading={busy} loadingLabel="Launching" disabled={!chosen.length} reason={!chosen.length ? "Connect Google or Facebook first." : undefined} onClick={launch}>
          {selfApprove ? (state.live ? `Launch for ${formatRupees(total)}` : `Approve ${formatRupees(total)}`) : `Send for approval · ${formatRupees(total)}`}
        </Button>
      </>}>
      <div className="stack">
        <section className="stack-sm" aria-labelledby="promo-where">
          <h3 className="label" id="promo-where">Where it shows</h3>
          {platformRow("meta", "Facebook and Instagram", isOn("instagram") || !state.live ? ["facebook", "instagram"] : ["facebook"], "Photo ad in feeds, Stories and Reels")}
          {platformRow("search", "Google Search", ["google"], `When someone searches “used ${vehicle.model} ${city}”`)}
          <div className="promo-platform is-off"><span className="promo-marks"><PlatformMark id="youtube" size={28} /></span><span className="promo-platform-text"><strong>YouTube</strong><span className="meta">{isOn("youtube") ? "Channel connected. YouTube video ads need a video of the car; they are not created automatically yet." : "Connect Google to link your YouTube channel."}</span></span></div>
          <div className={`promo-platform ${isOn("whatsapp") ? "is-on" : "is-off"}`}><span className="promo-marks"><PlatformMark id="whatsapp" size={28} /></span><span className="promo-platform-text"><strong>WhatsApp</strong><span className="meta">{isOn("whatsapp") ? "Customers who message your WhatsApp number get an instant reply from your AI agent." : "Connect WhatsApp so customers can message you and get an instant reply."}</span></span></div>
        </section>

        <section className="stack-sm" aria-labelledby="promo-budget">
          <h3 className="label" id="promo-budget">Budget for 30 days</h3>
          <div className="promo-presets" role="radiogroup" aria-labelledby="promo-budget">
            {presets.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={preset === p.id} className={`promo-preset ${preset === p.id ? "is-on" : ""}`} onClick={() => setPreset(p.id)} disabled={busy}>
                <strong>{formatRupees(p.total)}</strong><span>{p.label}</span>
              </button>
            ))}
          </div>
          <p className="meta">{presets.find((p) => p.id === preset)!.note} Never more than {formatRupees(Math.min(total, Math.max(rupees(100), Math.round((total / 30) * 1.5))))} a day. Stops by itself after 30 days.</p>
        </section>

        <section className="stack-sm" aria-labelledby="promo-ad">
          <h3 className="label" id="promo-ad">The ad</h3>
          <div className="promo-ad">
            <div className="promo-ad-media">{vehicle.photos?.[0] ? <img src={vehicle.photos[0]} alt="" /> /* eslint-disable-line @next/next/no-img-element */ : <VehicleArt ratio="1.91 / 1" />}</div>
            <div className="promo-ad-text"><strong>{plan.headline}</strong><p>{plan.body}</p><span className="btn btn-primary btn-sm" aria-hidden="true">See this car</span></div>
          </div>
          {!vehicle.photos?.length && reachable.meta ? <Notice tone="warn" role="status">Facebook and Instagram ads need a photo. Add one to this car in Inventory first.</Notice> : null}
          <p className="meta">Written only from facts on the car&apos;s record. Clicks open its page on your showroom ({link}), and every enquiry is linked to this car.</p>
        </section>

        {!selfApprove ? <Notice role="status">{can("campaign.approve") ? "Your approval policy needs a second person to approve spend, so this goes to them first." : "An owner or manager approves the spend before anything goes live."}</Notice> : null}
        <p className="meta">Want to post it on your own pages for free instead? <Link className="link-btn" href={href(`/app/inventory/${vehicle.id}`)}>Open the car</Link> and use Social posts after promoting.</p>
      </div>
    </Drawer>
  );
}

function CampaignList({ campaigns }: { campaigns: Campaign[] }) {
  const { state } = useWorkspace();
  const href = useScopedHref();
  if (!campaigns.length) return <EmptyState title="No campaigns yet">Promote a car and its campaign appears here.</EmptyState>;
  return (
    <ul className="camp-list">
      {campaigns.map((c) => {
        const v = state.vehicles.find((x) => x.id === c.vehicleId);
        const m = metricsFor(c);
        return (
          <li key={c.id}>
            <Link className="card camp-row" href={href(`/app/advertising/${c.id}`)}>
              <div className="camp-main"><strong>{v ? `${v.year} ${v.make} ${v.model}` : c.name}</strong><span className="meta">{[c.id, `${formatDate(c.startDate)} to ${formatDate(c.endDate)}`, c.channels.filter((ch) => ch.enabled).map((ch) => ch.id === "search" ? "Google" : ch.id === "meta" ? "Facebook and Instagram" : ch.id).join(", ")].join(" · ")}</span></div>
              <div className="camp-figures"><span>{formatRupees(totalBudget(c))}</span>{m ? <span className="meta">{m.leads} lead{m.leads === 1 ? "" : "s"}</span> : null}</div>
              <Badge tone={STATUS_TONE[c.status]}>{STATUS_WORD[c.status]}</Badge>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** One campaign: what is running where, its results, and the one action that applies now (approve, pause, resume). */
function CampaignView({ campaign }: { campaign: Campaign }) {
  const { state, can, run, refresh, actor } = useWorkspace();
  const url = useUrlState();
  const href = useScopedHref();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // The approval policy can require a second person: the one who promoted the car then cannot approve its spend.
  const mayApprove = can("campaign.approve") && !(state.policy.distinctApprover && campaign.createdBy === actor.sub);
  const vehicle = state.vehicles.find((v) => v.id === campaign.vehicleId);
  const metrics = metricsFor(campaign);
  const view = url.get("tab") === "posts" ? "posts" : "overview";
  const back = () => url.set({ campaign: null, view: "campaigns" });

  const platform = async (action: "publish" | "pause" | "resume") => {
    setBusy(true);
    try {
      const r = await fetch("/api/advertising/launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ campaignId: campaign.id, action }) });
      const body = await r.json().catch(() => ({}));
      toast(r.ok ? body.message : body?.error?.message ?? "That did not work. Try again.", r.ok ? undefined : "error");
    } catch { toast("We could not reach the server. Try again.", "error"); }
    await refresh();
    setBusy(false);
  };
  const local = (fn: Parameters<typeof run>[0], ok: string) => { const r = run(fn); toast(r.ok ? ok : r.message, r.ok ? undefined : "error"); return r.ok; };
  const approveAndLaunch = async () => {
    if (!local((s, a) => approveCampaign(s, a, campaign.id), "Approved.")) return;
    if (state.live) await platform("publish");
  };

  if (!vehicle) return <EmptyState title="Car not found">The car for this campaign is no longer in your branches.</EmptyState>;
  const s = campaign.status;
  const action = s === "Pending" && mayApprove ? <Button variant="primary" loading={busy} onClick={approveAndLaunch}>{state.live ? "Approve and launch" : "Approve"}</Button>
    : s === "Approved" ? <Button variant="primary" loading={busy} onClick={() => state.live ? platform("publish") : local((st, a) => publishCampaign(st, a, campaign.id), "Publish requested.")}>Launch</Button>
    : s === "Active" ? <Button loading={busy} onClick={() => state.live ? platform("pause") : local((st, a) => pauseCampaign(st, a, campaign.id), "Pause requested.")}>Pause</Button>
    : s === "Paused" ? <Button variant="primary" loading={busy} onClick={() => state.live ? platform("resume") : local((st, a) => resumeCampaign(st, a, campaign.id), "Resume requested.")}>Resume</Button>
    : null;
  return (
    <>
      <PageHead title={`${vehicle.year} ${vehicle.make} ${vehicle.model}`} lead={`${campaign.id} · ${formatDate(campaign.startDate)} to ${formatDate(campaign.endDate)} · ${campaign.region}`}
        actions={<><Button onClick={back}>All campaigns</Button>{can("campaign.edit") ? action : null}</>} />
      <div className="ads-status" aria-live="polite"><Badge tone={STATUS_TONE[s]}>{STATUS_WORD[s]}</Badge>
        <span className="meta">{s === "Pending" ? (mayApprove ? "Check the budget and ad, then approve." : can("campaign.approve") ? "Your approval policy needs a second owner or manager to approve spend you started." : "Waiting for an owner or manager to approve the spend.") : s === "Failed" ? "The platform refused it. See History." : campaign.platformAck === "awaiting" ? "Waiting for the platform to confirm." : ""}</span></div>
      <Tabs label="Campaign" idPrefix="camp" value={view} onChange={(v) => url.set({ tab: v === "overview" ? null : v, campaign: campaign.id })} tabs={[{ value: "overview", label: "Overview" }, { value: "posts", label: "Free posts for your pages" }]} />
      {view === "posts" ? <SocialPostKit vehicle={vehicle} campaign={campaign} /> : (
        <div className="ads-layout">
          <section className="card stack" aria-label="Campaign">
            <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
              <Kpi label="Budget, 30 days" value={formatRupees(campaign.totalCap30d)} tone="neutral" note={`Up to ${formatRupees(campaign.dailyCap)} a day`} />
              <Kpi label="Spent" value={metrics ? formatRupees(metrics.spend) : "—"} tone="neutral" note={metrics ? undefined : "Shown once the platform reports it"} />
              <Kpi label="Leads" value={metrics ? metrics.leads : "—"} tone="neutral" note={metrics ? `${formatRupees(metrics.cpl)} each` : "Counted from enquiries on this car"} />
            </div>
            <div className="stack-sm">
              <h3 className="label">Running on</h3>
              {campaign.channels.filter((ch) => ch.enabled).map((ch) => (
                <div key={ch.id} className="promo-platform is-on">
                  <span className="promo-marks">{(ch.id === "meta" ? ["facebook", "instagram"] as const : ["google"] as const).map((m) => <PlatformMark key={m} id={m} size={28} />)}</span>
                  <span className="promo-platform-text"><strong>{ch.id === "search" ? "Google Search" : ch.id === "meta" ? "Facebook and Instagram" : ch.id}</strong><span className="meta">{formatRupees(ch.budget)}{campaign.platform?.[ch.id === "search" ? "google" : "meta"] ? " · created on the platform" : ""}</span></span>
                </div>
              ))}
            </div>
            {metrics?.daily.length ? <div><h3 className="label">Daily spend (₹)</h3><SpendLine data={metrics.daily.map((d) => ({ label: d.date.slice(5), value: d.spend / 100 }))} format={(v) => `₹${v}`} /></div> : null}
            <div className="stack-sm">
              <h3 className="label">History</h3>
              <ul className="timeline">{[...campaign.history].reverse().map((h, i) => <li key={i}><strong>{h.action}</strong><span className="meta">{h.actor} · {formatDateTime(h.at)}</span></li>)}</ul>
            </div>
            {(s === "Draft" || s === "Pending" || s === "Approved") && can("campaign.edit") ? <div><Button variant="danger" size="sm" onClick={() => {
              // Nothing has spent yet, so withdrawing removes it.
              if (local((st, a) => withdrawCampaign(st, a, campaign.id), "Campaign withdrawn. Nothing was spent.")) back();
            }}>{s === "Draft" ? "Discard" : "Withdraw"}</Button></div> : null}
          </section>
          <aside className="ads-side" aria-label="Ad preview">
            <section className="card ads-preview">
              <h2 className="ads-preview-label">The ad</h2>
              {vehicle.photos?.[0] ? <img className="promo-preview-img" src={vehicle.photos[0]} alt="" /> /* eslint-disable-line @next/next/no-img-element */ : <VehicleArt ratio="1.91 / 1" />}
              <p className="ads-preview-head">{campaign.headline}</p>
              <p className="ads-preview-body">{campaign.body}</p>
              <span className="btn btn-primary btn-sm ads-preview-cta" aria-hidden="true">See this car</span>
              <p className="meta"><Link href={href(`/app/inventory/${vehicle.id}`)}>Open the car</Link> · {formatMoney(vehicle.asking)}</p>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
