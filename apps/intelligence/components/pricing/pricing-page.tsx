"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { approvePriceRequest, createPriceRequest, evidenceExpired, HOLDING_SELLING_DEFAULT, recommendedAsking, rejectPriceRequest, retryFailedChannels, submitPriceRequest, withdrawPriceRequest } from "@/lib/actions";
import type { PriceRequest, PriceRequestStatus, Vehicle } from "@/lib/domain";
import { tierExplanation } from "@/lib/evidence";
import { landedCost, needsPriceReview, priceImpact, stockAgeDays } from "@/lib/finance";
import { formatDateTime, formatExact, formatLakh2, formatMoney, formatPercent, formatShortDateTime, formatKm, MISSING, parseRupeeInput } from "@/lib/format";
import { SNAPSHOT_AT } from "@/lib/time";
import { comparablesForVehicle, valuationFor } from "@/lib/valuation";
import { Dialog, Drawer } from "../overlay";
import { Panel } from "../panel";
import { useToast } from "../toast";
import { Badge, Button, EmptyState, FormSummary, Notice, PageHead, RupeeField, SelectField, Tabs, TextArea, TextField } from "../ui";
import { useScopedHref, useUrlState, useWorkspace } from "../workspace";
import { EvidenceBadge } from "../market/common";

type TabKey = "review" | "pending" | "approved" | "rejected";
const APPROVED_STATES: PriceRequestStatus[] = ["Approved", "Applying", "Applied", "PartiallySynced", "Failed"];
const STATUS_LABEL: Record<PriceRequestStatus, string> = { Draft: "Draft", Pending: "Pending", Approved: "Approved", Applying: "Applying", Applied: "Applied", PartiallySynced: "Partially synced", Failed: "Failed", Rejected: "Rejected", Withdrawn: "Withdrawn" };
const FLOW: PriceRequestStatus[] = ["Draft", "Pending", "Approved", "Applying", "Applied"];

export function PricingPage({ requestId }: { requestId?: string }) {
  const { state, scope } = useWorkspace();
  const url = useUrlState();
  const inScopeVehicles = useMemo(() => state.vehicles.filter((v) => scope.ids.includes(v.branchId)), [state.vehicles, scope.ids]);
  const requests = useMemo(() => state.priceRequests.filter((r) => inScopeVehicles.some((v) => v.id === r.vehicleId)), [state.priceRequests, inScopeVehicles]);
  const activeIds = new Set(requests.filter((r) => ["Draft", "Pending"].includes(r.status)).map((r) => r.vehicleId));
  const flagged = inScopeVehicles.filter((v) => needsPriceReview(v) && !activeIds.has(v.id));
  const drafts = requests.filter((r) => r.status === "Draft");
  const pending = requests.filter((r) => r.status === "Pending");
  const approved = requests.filter((r) => APPROVED_STATES.includes(r.status));
  const rejected = requests.filter((r) => r.status === "Rejected" || r.status === "Withdrawn");

  const routed = requestId ? requests.find((r) => r.id === requestId) : undefined;
  const initialTab: TabKey = routed ? (routed.status === "Pending" ? "pending" : routed.status === "Draft" ? "review" : routed.status === "Rejected" || routed.status === "Withdrawn" ? "rejected" : "approved") : "review";
  const tab = ((["review", "pending", "approved", "rejected"] as const).find((t) => t === url.get("tab")) ?? initialTab) as TabKey;
  const selectedRequestId = url.get("request") || (requestId ?? "");
  const selectedVehicleParam = url.get("vehicle");

  const reviewVehicles = useMemo(() => {
    const ids = new Set<string>([...drafts.map((d) => d.vehicleId), ...flagged.map((v) => v.id)]);
    if (selectedVehicleParam) ids.add(selectedVehicleParam);
    return inScopeVehicles.filter((v) => ids.has(v.id));
  }, [drafts, flagged, inScopeVehicles, selectedVehicleParam]);
  const manualOptions = inScopeVehicles.filter((v) => v.status === "available" && !reviewVehicles.some((r) => r.id === v.id) && !activeIds.has(v.id));
  const list: PriceRequest[] = tab === "pending" ? pending : tab === "approved" ? approved : tab === "rejected" ? rejected : [];
  const selectedRequest = tab === "review" ? drafts.find((d) => d.vehicleId === (selectedVehicleParam || reviewVehicles[0]?.id)) : (list.find((r) => r.id === selectedRequestId) ?? list[0]);
  const selectedVehicle = tab === "review" ? inScopeVehicles.find((v) => v.id === (selectedVehicleParam || reviewVehicles[0]?.id)) : inScopeVehicles.find((v) => v.id === selectedRequest?.vehicleId);

  return (
    <div className="page">
      <PageHead title="Pricing intelligence and approval" lead="Evidence-led asking-price decisions with explicit human approval." />
      <Tabs label="Request queue" value={tab} onChange={(v) => url.set({ tab: v === "review" ? null : v, request: null, vehicle: null })} idPrefix="prc"
        tabs={[{ value: "review", label: "Needs review", count: reviewVehicles.length }, { value: "pending", label: "Pending", count: pending.length }, { value: "approved", label: "Approved", count: approved.length }, { value: "rejected", label: "Rejected", count: rejected.length }]} />

      {tab === "review" ? (
        reviewVehicles.length === 0 && manualOptions.length === 0 ? <NoCandidates lastScan={SNAPSHOT_AT} /> : (
          <>
            <div className="selector-row">
              <SelectField label="Vehicle" value={selectedVehicle?.id ?? ""} onChange={(e) => url.set({ vehicle: e.target.value || null })} options={[
                ...reviewVehicles.map((v) => ({ value: v.id, label: `${v.id} / ${v.make} ${v.model} / ${activeDraft(drafts, v.id) ? "Draft" : "Needs review"}` })),
                ...manualOptions.map((v) => ({ value: v.id, label: `${v.id} / ${v.make} ${v.model} / manual request` })),
              ]} />
              <span className="meta">{reviewVehicles.length ? `${reviewVehicles.length} vehicle${reviewVehicles.length > 1 ? "s" : ""} flagged by the review policy (${state.policy.reviewThresholdDays}-day threshold). Last scan ${formatDateTime(SNAPSHOT_AT)}.` : "No vehicle is flagged. You can still raise an authorised manual request with an explicit reason."}</span>
            </div>
            {selectedVehicle ? <Workbench key={`${selectedVehicle.id}-${selectedVehicle.version}-${selectedRequest?.id ?? "new"}`} vehicle={selectedVehicle} draft={selectedRequest} mode="draft" /> : null}
          </>
        )
      ) : (
        list.length === 0 ? <EmptyState title={`No ${tab} requests`}>{tab === "pending" ? "Nothing is waiting for approval. New submissions appear here and notify the approver once." : tab === "approved" ? "Approved requests and their channel sync results appear here." : "Rejected and withdrawn requests stay here for audit."}</EmptyState> : (
          <>
            <div className="selector-row">
              <SelectField label="Request" value={selectedRequest?.id ?? ""} onChange={(e) => url.set({ request: e.target.value })} options={list.map((r) => ({ value: r.id, label: `${r.id} / ${r.vehicleId} / ${STATUS_LABEL[r.status]}` }))} />
              <span className="meta">Request status: {selectedRequest ? STATUS_LABEL[selectedRequest.status] : MISSING}</span>
            </div>
            {selectedRequest && selectedVehicle ? <Workbench key={`${selectedRequest.id}-${selectedRequest.status}-${selectedRequest.syncs.length}`} vehicle={selectedVehicle} draft={selectedRequest} mode={tab === "pending" ? "decision" : "record"} /> : null}
          </>
        )
      )}
      <p className="footnote">No price is applied until approval and a version check. Without market evidence there is no recommendation, only a manual request.</p>
    </div>
  );
}

const activeDraft = (drafts: PriceRequest[], vehicleId: string) => drafts.some((d) => d.vehicleId === vehicleId);

function NoCandidates({ lastScan }: { lastScan: string }) {
  const { state } = useWorkspace();
  return <EmptyState title="No candidates for price review">The review policy flags available vehicles older than {state.policy.reviewThresholdDays} days with fewer enquiries than their cohort median. Last scan {formatDateTime(lastScan)}. Insufficient evidence blocks an automated proposal; an authorised manual request needs an explicit reason.</EmptyState>;
}

function Workbench({ vehicle, draft, mode }: { vehicle: Vehicle; draft?: PriceRequest; mode: "draft" | "decision" | "record" }) {
  const { state, actor, can, run } = useWorkspace();
  const href = useScopedHref();
  const toast = useToast();
  const valuation = useMemo(() => valuationFor(vehicle), [vehicle]);
  const landed = draft?.landed ?? landedCost(vehicle.costs);
  const currentAsking = draft?.currentAsking ?? vehicle.asking ?? 0;
  const model = recommendedAsking(vehicle);
  const [proposed, setProposed] = useState(() => { const p = draft?.proposedAsking ?? model; return p === null || p === undefined ? "" : String(p / 100); });
  const [reason, setReason] = useState(draft?.reason ?? (model !== null ? "Ageing stock and low enquiry activity" : ""));
  const [floorRationale, setFloorRationale] = useState(draft?.floorRationale ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const proposedPaise = mode === "draft" ? parseRupeeInput(proposed) : draft?.proposedAsking ?? parseRupeeInput(proposed);
  const holding = draft?.holdingSelling ?? HOLDING_SELLING_DEFAULT;
  const impact = priceImpact({ currentAsking, proposedAsking: proposedPaise ?? currentAsking, landed, holdingSelling: holding });
  const estimate = draft && mode !== "draft" ? draft.estimate : valuation.estimate;
  const low = draft && mode !== "draft" ? draft.rangeLow : valuation.low;
  const high = draft && mode !== "draft" ? draft.rangeHigh : valuation.high;
  const n = draft && mode !== "draft" ? draft.evidenceN : valuation.n;
  const tier = draft && mode !== "draft" ? draft.evidenceTier : valuation.tier;
  const evidenceAt = draft?.evidenceAt ?? valuation.observedAt;
  const days = stockAgeDays(vehicle, SNAPSHOT_AT);
  const floor = Math.round((landed * state.policy.priceFloorPercent) / 100);
  const belowFloor = proposedPaise !== null && proposedPaise < floor;
  const userEdited = model !== null && proposedPaise !== model;
  const expired = evidenceExpired(evidenceAt, SNAPSHOT_AT, state.policy.evidenceExpiryDays);
  const canPropose = can("price.propose");
  const isRequester = draft?.requestedBy === actor.sub;
  const selfBlocked = state.policy.distinctApprover && isRequester;

  const submit = (asDraft: boolean) => {
    const result = run((s, a) => (draft && draft.status === "Draft" && !asDraft ? submitPriceRequest(s, a, draft.id) : createPriceRequest(s, a, { vehicleId: vehicle.id, proposedAsking: proposedPaise, reason, floorRationale, submit: !asDraft })));
    if (!result.ok) {
      if (result.status === 409) { setConflict(result.message); return; }
      setErrors(result.fields ?? { form: result.message });
      return;
    }
    setErrors({});
    toast(asDraft ? "Draft saved. It can be edited until submitted." : `${result.request.id} submitted. The approver is notified once.`);
  };

  const approve = () => {
    const result = run((s, a) => approvePriceRequest(s, a, draft!.id));
    setConfirmOpen(false);
    if (!result.ok) { if (result.status === 409) setConflict(result.message); else toast(result.message, "error"); return; }
    toast(`${draft!.id} approved. Internal price applied; per-channel sync results are shown below.`);
  };

  return (
    <div className="stack" style={{ gap: 24 }}>
      {conflict ? <Notice tone="danger" role="alert"><strong>Approval blocked.</strong> {conflict} Refresh the evidence and resubmit; the audit keeps the old request.{" "}{draft && mode !== "draft" ? <Link className="accent-text" href={href("/app/pricing", { vehicle: vehicle.id })}>Open a fresh review</Link> : null}</Notice> : null}
      <section className="card summary-card" aria-labelledby="sum-title">
        <div className="spread" style={{ flexWrap: "wrap" }}>
          <h2 className="h3" id="sum-title">{vehicle.id} / {vehicle.make} {vehicle.model} / {vehicle.year}</h2>
          {draft ? <div className="row-flex"><Badge tone={draft.status === "Rejected" ? "danger" : draft.status === "PartiallySynced" || draft.status === "Failed" ? "warn" : "accent"}>{STATUS_LABEL[draft.status]}</Badge><span className="meta">{draft.id} / version {vehicle.version}</span></div> : <Badge>Draft not saved</Badge>}
        </div>
        <div className="summary-grid">
          <div><span className="meta">Current asking</span><strong className="price-med" title={formatExact(currentAsking)}>{formatMoney(currentAsking)}</strong></div>
          <div><span className="meta">Proposed asking{userEdited && mode === "draft" ? " (user-edited)" : model !== null && mode === "draft" ? " (model proposal)" : ""}</span><strong className="price-med tone-accent" title={formatExact(proposedPaise)}>{proposedPaise === null ? MISSING : formatMoney(proposedPaise)}</strong></div>
          <div><span className="meta">Est. market value</span><strong className="price-med" title={formatExact(estimate)}>{estimate === null ? MISSING : formatMoney(estimate)}</strong></div>
          <div><span className="meta">Landed cost</span><strong className="price-med" title={formatExact(landed)}>{formatMoney(landed)}</strong></div>
        </div>
      </section>

      <div className="pricing-grid">
        <Panel title="Evidence" rows={5} partialFail>
          <section className="card" aria-labelledby="why-title">
            <h2 className="h3" id="why-title">Why review this price?</h2>
            <ul className="reason-list">
              <li>{days} stock days / configured review threshold {state.policy.reviewThresholdDays} days</li>
              <li>{vehicle.enquiries14d} enquiries in 14 days / cohort median {vehicle.cohortMedianEnquiries}</li>
              <li>{n} comparable asks / observed within {valuation.windowDays} days</li>
            </ul>
            {tier === "Insufficient" || estimate === null || low === null || high === null ? (
              <Notice tone="warn" role="status">Insufficient evidence blocks an automated proposal. An authorised manual request needs an explicit reason. Descriptive evidence only.</Notice>
            ) : <PriceStrip low={low} estimate={estimate} high={high} proposed={proposedPaise} />}
            <div className="row-flex mt-4"><span className="accent-text">Method {valuation.methodVersion} / Evidence: {tier === "Insufficient" ? "Insufficient" : tier}</span><button type="button" className="link-btn" onClick={() => setEvidenceOpen(true)}>Inspect evidence &gt;</button></div>
            <p className="meta mt-2">Evidence observed {formatDateTime(evidenceAt)}. {expired ? <span className="warn-text">Evidence expired after {state.policy.evidenceExpiryDays} days: revalidate before approval.</span> : `Expires after ${state.policy.evidenceExpiryDays} days.`}</p>
          </section>
        </Panel>
        <Panel title="Financial impact" rows={5} partialFail>
          <section className="card" aria-labelledby="fi-title">
            <h2 className="h3" id="fi-title">Estimated financial impact</h2>
            <dl className="kv mt-4">
              <div><dt>Ask reduction</dt><dd>{formatLakh2(impact.reduction)} / {formatPercent(impact.reductionPct, { dp: 1 })}</dd></div>
              <div><dt>Current gross at ask</dt><dd>{formatMoney(impact.currentGross)}</dd></div>
              <div><dt>Proposed gross</dt><dd>{formatMoney(impact.proposedGross)}</dd></div>
              <div><dt>Holding/selling estimate</dt><dd>{formatLakh2(holding)}</dd></div>
              <div><dt>Proposed contribution</dt><dd className={impact.contribution < 0 ? "tone-danger" : "tone-accent"}>{formatLakh2(impact.contribution)}</dd></div>
            </dl>
            <p className="meta mt-4">Estimates only. No claim of faster sale or conversion uplift.</p>
          </section>
        </Panel>
      </div>

      {mode === "draft" ? (
        <section className="card" aria-labelledby="form-title">
          <h2 className="h3" id="form-title">Draft request / changes require approval</h2>
          <FormSummary errors={errors} />
          <div className="approval-form mt-4">
            <RupeeField label="Proposed asking" required value={proposed} onChange={(raw) => { setProposed(raw); setErrors({}); }} error={errors.proposedAsking} help={proposedPaise ? formatExact(proposedPaise) : undefined} placeholder="₹25,90,000" />
            <TextField label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />
            <div className="approval-submit"><Button variant="primary" className="btn-block" onClick={() => submit(false)} disabled={!canPropose || vehicle.status !== "available"} reason={!canPropose ? "Requires Owner, Manager or Inventory access. Lower-permission users see Request only." : undefined}>Submit for approval</Button></div>
          </div>
          {belowFloor ? <div className="mt-4"><Notice tone="warn" role="status">This price is below the configured floor ({formatMoney(floor)}). It routes to owner exception review with a rationale: it cannot silently bypass approval.</Notice><TextArea label="Floor exception rationale" required value={floorRationale} onChange={(e) => setFloorRationale(e.target.value)} error={errors.floorRationale} className="mt-2" /></div> : null}
          <p className="meta mt-4"><button type="button" className="link-btn" onClick={() => submit(true)} disabled={!canPropose}>Save draft</button> / Channel scope: owned site only / Distinct approver required</p>
        </section>
      ) : null}

      {mode === "decision" && draft ? (
        <section className="card" aria-labelledby="dec-title">
          <h2 className="h3" id="dec-title">Decision</h2>
          <dl className="kv"><div><dt>Requested by</dt><dd>{draft.requestedByName} / {formatShortDateTime(draft.requestedAt)}</dd></div><div><dt>Reason</dt><dd style={{ maxWidth: 520 }}>{draft.reason}</dd></div><div><dt>Proposal</dt><dd>{draft.userEdited ? "User-edited" : "Model proposal"}</dd></div>{draft.belowFloor ? <div><dt>Below floor</dt><dd>{draft.floorRationale ?? "Owner exception review required"}</dd></div> : null}</dl>
          <div className="row-flex mt-4">
            <Button variant="primary" onClick={() => setConfirmOpen(true)} disabled={!can("price.approve") || selfBlocked} reason={selfBlocked ? "Self-approval is prohibited under the default approval policy. Ask a distinct approver." : !can("price.approve") ? "Requires Owner or Manager access. You can request only." : undefined}>Approve</Button>
            <Button variant="danger" onClick={() => setRejectOpen(true)} disabled={!can("price.approve") || selfBlocked}>Reject</Button>
            {isRequester ? <Button onClick={() => { const r = run((s, a) => withdrawPriceRequest(s, a, draft.id)); if (r.ok) toast("Request withdrawn."); else toast(r.message, "error"); }}>Withdraw</Button> : null}
          </div>
        </section>
      ) : null}

      {mode === "record" && draft ? <RecordPanel request={draft} /> : null}

      <Evidence open={evidenceOpen} onClose={() => setEvidenceOpen(false)} vehicle={vehicle} tier={tier} method={valuation.methodVersion} />
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm price change" description="Review exactly what changes before approving." size="w640" footer={<><Button onClick={() => setConfirmOpen(false)}>Cancel</Button><Button variant="primary" onClick={approve}>Approve price change</Button></>}>
        {draft ? <dl className="kv"><div><dt>Old asking</dt><dd>{formatExact(draft.currentAsking)}</dd></div><div><dt>New asking</dt><dd className="tone-accent">{formatExact(draft.proposedAsking)}</dd></div><div><dt>Gross impact</dt><dd>{formatLakh2(draft.proposedAsking - draft.landed)} proposed vs {formatLakh2(draft.currentAsking - draft.landed)} current</dd></div><div><dt>Effective</dt><dd>On approval</dd></div><div><dt>Channels</dt><dd>{draft.channelScope.join(", ")}</dd></div></dl> : null}
        <Notice role="status">Approval applies the internal price and queues per-channel sync. It does not mean every channel has synced.</Notice>
      </Dialog>
      <RejectDialog open={rejectOpen} onClose={() => setRejectOpen(false)} onReject={(reasonText) => { const r = run((s, a) => rejectPriceRequest(s, a, draft!.id, reasonText)); if (r.ok) { toast("Request rejected with reason."); setRejectOpen(false); return null; } return r.fields?.reason ?? r.message; }} />
    </div>
  );
}

function RejectDialog({ open, onClose, onReject }: { open: boolean; onClose: () => void; onReject: (reason: string) => string | null }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setReason(""); setError(""); } }, [open]);
  return (
    <Dialog open={open} onClose={onClose} dirty={Boolean(reason)} title="Reject price request" description="Reject requires a reason that is stored with the request." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" onClick={() => setError(onReject(reason) ?? "")}>Reject request</Button></>}>
      <TextArea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} error={error} data-autofocus />
    </Dialog>
  );
}

function RecordPanel({ request }: { request: PriceRequest }) {
  const { run, can } = useWorkspace();
  const toast = useToast();
  const failed = request.syncs.filter((s) => s.status === "Failed");
  const stages = request.status === "Rejected" || request.status === "Withdrawn" ? [request.status] : FLOW;
  const current = request.status === "PartiallySynced" || request.status === "Failed" ? "Applied" : request.status;
  return (
    <section className="card stack" aria-labelledby="rec-title">
      <h2 className="h3" id="rec-title">Request record</h2>
      <ol className="flow" aria-label="Request state">{stages.map((s) => <li key={s} aria-current={s === current ? "step" : undefined} className={s === current ? "on" : ""}>{STATUS_LABEL[s as PriceRequestStatus]}</li>)}</ol>
      <dl className="kv">
        <div><dt>Requester</dt><dd>{request.requestedByName} / {formatDateTime(request.requestedAt)}</dd></div>
        {request.approverName ? <div><dt>{request.status === "Rejected" ? "Rejected by" : "Approver"}</dt><dd>{request.approverName} / {formatDateTime(request.decidedAt)}</dd></div> : null}
        {request.rejectReason ? <div><dt>Rejection reason</dt><dd style={{ maxWidth: 520 }}>{request.rejectReason}</dd></div> : null}
        <div><dt>Evidence snapshot</dt><dd>n = {request.evidenceN} / {request.evidenceTier} / {request.methodVersion} / {formatDateTime(request.evidenceAt)}</dd></div>
        <div><dt>Price</dt><dd>{formatExact(request.currentAsking)} → {formatExact(request.proposedAsking)}</dd></div>
      </dl>
      {request.syncs.length ? (
        <>
          <h3 className="h3">Internal price applied and channel results are separate</h3>
          <div className="table-wrap fit"><table className="data-table dense"><thead><tr><th>Channel</th><th>Result</th><th>Sync ID</th><th>Detail</th></tr></thead>
            <tbody>{request.syncs.map((s) => <tr key={s.channel}><td>{s.channel}</td><td>{s.status === "Applied" ? "Applied" : s.status === "Failed" ? <span className="warn-text">Failed</span> : "Queued"}</td><td>{s.syncId ?? MISSING}</td><td className="muted">{s.error ?? formatShortDateTime(s.at)}</td></tr>)}</tbody></table></div>
          {failed.length ? <div><Button variant="primary" onClick={() => { const r = run((s, a) => retryFailedChannels(s, a, request.id)); if (r.ok) toast(`${r.retried} failed channel(s) retried. Successful channels were not touched.`); else toast(r.message, "error"); }} disabled={!can("price.approve") && !can("settings.integrations")}>Retry failed channels only</Button></div> : null}
        </>
      ) : null}
      <h3 className="h3">History</h3>
      <ul className="timeline">{[...request.history].reverse().map((h, i) => <li key={i}><strong>{h.action}</strong><span className="meta">{h.actor} / {formatShortDateTime(h.at)}{h.detail ? ` / ${h.detail}` : ""}</span></li>)}</ul>
    </section>
  );
}

function PriceStrip({ low, estimate, high, proposed }: { low: number; estimate: number; high: number; proposed: number | null }) {
  const min = Math.min(low, proposed ?? low) - 50_00_000;
  const max = Math.max(high, proposed ?? high) + 50_00_000;
  const pos = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  return (
    <div className="range-strip" role="img" aria-label={`Comparable range ${formatMoney(low)} to ${formatMoney(high)}, estimate ${formatMoney(estimate)}${proposed ? `, proposed ${formatMoney(proposed)}` : ""}`}>
      <div className="range-track"><div className="range-band" style={{ left: pos(low), width: `calc(${pos(high)} - ${pos(low)})`, background: "var(--accent)" }} /><span className="range-tick" style={{ left: pos(low), background: "var(--text)" }} /><span className="range-tick" style={{ left: pos(estimate), background: "var(--text)" }} /><span className="range-tick" style={{ left: pos(high), background: "var(--text)" }} />{proposed ? <span className="range-tick" style={{ left: pos(proposed), background: "var(--warning)" }} /> : null}</div>
      <div className="range-labels"><span style={{ left: pos(low) }}>{formatMoney(low)}</span><span className="tone-accent" style={{ left: pos(estimate) }}>{formatMoney(estimate)}</span><span style={{ left: pos(high) }}>{formatMoney(high)}</span></div>
    </div>
  );
}

function Evidence({ open, onClose, vehicle, tier, method }: { open: boolean; onClose: () => void; vehicle: Vehicle; tier: "High" | "Moderate" | "Insufficient"; method: string }) {
  const comps = useMemo(() => comparablesForVehicle(vehicle), [vehicle]);
  return (
    <Drawer open={open} onClose={onClose} size="w560" title="Comparable evidence" description={`${vehicle.id} / ${comps.length} comparable listing asks / method ${method}`} footer={<Button variant="primary" onClick={onClose}>Close</Button>}>
      <p className="muted">Evidence tier <EvidenceBadge tier={tier} />: {tierExplanation[tier]}. These are asking prices, not completed sales.</p>
      <div className="table-wrap fit"><table className="data-table dense"><thead><tr><th>Listing</th><th className="num">Asking</th><th>Attributes</th><th>Observed</th></tr></thead>
        <tbody>{comps.map((c) => <tr key={c.id}><td><span className="row-title">{c.id}</span><span className="sub">{c.source}</span></td><td className="num">{formatMoney(c.asking)}</td><td><span className="sub">{c.year} / {formatKm(c.km)} km / {c.owners} owner(s)</span><span className="sub">Matched: {c.matchedAttributes.join(", ")}</span></td><td>{formatShortDateTime(c.observedAt)}</td></tr>)}</tbody></table></div>
      <p className="meta">Exclusions are counted in the market radar evidence drawer. Opening the source needs licence permission.</p>
    </Drawer>
  );
}
