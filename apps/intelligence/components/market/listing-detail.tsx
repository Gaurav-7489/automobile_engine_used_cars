"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LISTINGS } from "@/lib/fixtures/market";
import { scenarioTotals } from "@/lib/finance";
import { evidenceTier, median, percentile, tierExplanation } from "@/lib/evidence";
import { formatDateTime, formatExact, formatKm, formatMoney, formatLakh2, formatShortDateTime, lakh, MISSING, parseLakhInput, daysBetween } from "@/lib/format";
import { comparablesFor, priceHistoryFor } from "@/lib/market";
import { createAcquisitionReview, logContactIntent, saveScenario, toggleWatch } from "@/lib/actions";
import { SNAPSHOT_AT } from "@/lib/time";
import { valuationForListing } from "@/lib/valuation";
import { Dialog, Drawer } from "../overlay";
import { Panel } from "../panel";
import { useToast } from "../toast";
import { Button, EmptyState, FormSummary, Notice, Tabs, TextArea, TextField, PageHead } from "../ui";
import { VehicleArt } from "../vehicle-art";
import { useScopedHref, useUrlState, useWorkspace } from "../workspace";
import { EvidenceBadge } from "./common";
import { Icon } from "../icons";

type TabKey = "overview" | "comparables" | "history" | "costs" | "documents";
const TABS: { value: TabKey; label: string }[] = [{ value: "overview", label: "Overview" }, { value: "comparables", label: "Comparables" }, { value: "history", label: "Price history" }, { value: "costs", label: "Costs" }, { value: "documents", label: "Documents" }];
const DEFAULT_COSTS = { transport: lakh(0.35), inspection: lakh(0.05), refurbishment: lakh(0.4), fees: lakh(0.2), holdingSelling: lakh(0.2) };

export function ListingDetail({ id }: { id: string }) {
  const listing = LISTINGS.find((l) => l.id === id);
  if (!listing) return <ListingMissing />;
  return <Detail key={id} listing={listing} />;
}

function ListingMissing() {
  const href = useScopedHref();
  return (
    <div className="page">
      <PageHead title="Listing unavailable" lead="This listing is unavailable or was withdrawn by its source." />
      <EmptyState title="Back to results" actions={<Link href={href("/app/market")} className="btn btn-primary">Back to results</Link>}>Source state and observation time are shown here when the feed reports a withdrawal.</EmptyState>
    </div>
  );
}

function Detail({ listing }: { listing: (typeof LISTINGS)[number] }) {
  const { state, run, can } = useWorkspace();
  const url = useUrlState();
  const href = useScopedHref();
  const toast = useToast();
  const valuation = useMemo(() => valuationForListing(listing), [listing]);
  const { items: comps, exclusions } = useMemo(() => comparablesFor(listing), [listing]);
  const history = useMemo(() => priceHistoryFor(listing), [listing]);
  const tab = (TABS.find((t) => t.value === url.get("tab"))?.value ?? "overview") as TabKey;
  const asks = comps.map((c) => c.asking);
  const low = valuation.estimate === null ? null : percentile(asks, 25) ?? null;
  const high = valuation.estimate === null ? null : percentile(asks, 75) ?? null;
  const saved = state.scenarios.find((s) => s.listingId === listing.id);
  const [offer, setOffer] = useState(String((saved?.offer ?? listing.asking) / lakh(1)));
  const [costs, setCosts] = useState({ transport: String((saved?.transport ?? DEFAULT_COSTS.transport) / lakh(1)), inspection: String((saved?.inspection ?? DEFAULT_COSTS.inspection) / lakh(1)), refurbishment: String((saved?.refurbishment ?? DEFAULT_COSTS.refurbishment) / lakh(1)), fees: String((saved?.fees ?? DEFAULT_COSTS.fees) / lakh(1)), holdingSelling: String((saved?.holdingSelling ?? DEFAULT_COSTS.holdingSelling) / lakh(1)), targetResale: String((saved?.targetResale ?? (valuation.estimate ? Math.round((valuation.estimate + lakh(0.8)) / 100_000) * 100_000 : listing.asking)) / lakh(1)) });
  const scenario = useMemo(() => {
    const n = (t: string) => parseLakhInput(t) ?? 0;
    return { offer: n(offer), transport: n(costs.transport), inspection: n(costs.inspection), refurbishment: n(costs.refurbishment), fees: n(costs.fees), holdingSelling: n(costs.holdingSelling), targetResale: n(costs.targetResale) };
  }, [offer, costs]);
  const totals = scenarioTotals(scenario);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceRow, setEvidenceRow] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [image, setImage] = useState(0);
  const watching = state.watchlist.includes(listing.id);
  const hasDraft = state.reviews.some((r) => r.listingId === listing.id);
  const rangeText = low !== null && high !== null ? `Range ${formatMoney(low)}-${formatMoney(high).replace("₹", "")}; model estimate ${formatMoney(valuation.estimate)}` : "No estimate: insufficient evidence";

  const share = async () => { try { await navigator.clipboard.writeText(window.location.href); toast("Internal link copied. It works only for signed-in colleagues with access."); } catch { toast("Copy failed. Copy the address from the browser instead.", "error"); } };

  return (
    <div className="page detail">
      <div>
        <PageHead title={`${listing.make} ${listing.model} ${listing.variant}`} actions={<>
          <Button aria-pressed={watching} onClick={() => { run((s) => ({ ok: true as const, state: toggleWatch(s, listing.id) })); toast(watching ? "Removed from watchlist." : "Added to watchlist."); }}><Icon name="heart" size={18} />{watching ? "Watching" : "Watch"}</Button>
          <Button onClick={share}><Icon name="share" size={18} />Share internal link</Button>
        </>}>
          <p className="lead breadcrumb"><Link className="accent-text" href={href("/app/market", {})}>Radar</Link> &gt; Listing {listing.id} / {listing.year} / {listing.fuel} / {listing.transmission}</p>
        </PageHead>
      </div>

      <Panel title="Listing" rows={5} partialFail>
        <div className="detail-hero">
          <div className="gallery">
            <button type="button" className="gallery-main" onClick={() => setLightbox(image)} aria-label={`Open gallery, image ${image + 1} of 4`}><VehicleArt label="Schematic vehicle image" ratio="560 / 272" /></button>
            <div className="thumbs" role="group" aria-label="Gallery thumbnails">
              {[0, 1, 2, 3].map((i) => <button key={i} type="button" className="thumb" aria-pressed={image === i} aria-label={`Show image ${i + 1}`} onClick={() => setImage(i)}><VehicleArt label="Schematic vehicle image" ratio="124 / 64" /></button>)}
            </div>
          </div>
          <section className="card facts" aria-labelledby="facts-title">
            <h2 className="h3" id="facts-title">Listing facts / {listing.source.replace("Authorised ", "").replace("feed", "Feed")}</h2>
            <div className="price-pair">
              <div><div className="price-big" title={formatExact(listing.asking)}>{formatMoney(listing.asking)}</div><div className="meta">Asking price</div></div>
              <div><div className="price-big tone-accent" title={formatExact(listing.estimate)}>{listing.estimate === null ? MISSING : formatMoney(listing.estimate)}</div><div className="meta">Est. market value</div></div>
            </div>
            <p className="muted">{formatKm(listing.km)} km / {listing.owners} owner{listing.owners > 1 ? "s" : ""} / {listing.city}, {listing.state}. Observed {formatDateTime(listing.observedAt)} / {valuation.tier === "Insufficient" ? "Insufficient evidence" : `${valuation.tier} evidence`}</p>
            <div className="row-flex facts-actions">
              <Button variant="primary" onClick={() => setContactOpen(true)} disabled={!can("acquisition.review")} reason={!can("acquisition.review") ? "Contacting a source needs Owner, Manager or Inventory access." : undefined}>Contact source</Button>
              <Button onClick={() => setReviewOpen(true)} disabled={!can("acquisition.review")} reason={!can("acquisition.review") ? "Acquisition review needs Owner, Manager or Inventory access." : undefined}>{hasDraft ? "Acquisition review (draft)" : "Acquisition review"}</Button>
              <Button className="only-mobile" onClick={() => setEvidenceOpen(true)}>View evidence</Button>
            </div>
            <p className="meta">Watch / Share internal link / Inspection: not provided</p>
          </section>
        </div>
      </Panel>

      <Tabs tabs={TABS} value={tab} onChange={(v) => url.set({ tab: v === "overview" ? null : v })} label="Listing sections" idPrefix="lst" />

      {tab === "overview" ? (
        <div className="analysis" role="tabpanel" aria-labelledby="lst-overview">
          <Panel title="Market evidence" rows={4} partialFail>
            <section className="card" aria-labelledby="ev-title">
              <h2 className="h3" id="ev-title">Market evidence / listing asks</h2>
              <p className="h3" style={{ marginTop: 16 }}>{rangeText}</p>
              <RangeStrip low={low} high={high} estimate={valuation.estimate} asking={listing.asking} />
              <div className="stat-line mt-4"><div><strong>{valuation.n}</strong><span className="meta">Matched listings</span></div><div><strong>{valuation.windowDays} days</strong><span className="meta">Observation window</span></div><div><strong>{valuation.tier === "Insufficient" ? "Insufficient" : valuation.tier}</strong><span className="meta">Evidence tier</span></div></div>
              <p className="muted mt-4">Matched by variant, year, fuel, transmission and km band. These are asking prices, not completed-sale prices.</p>
              <div className="row-flex mt-4"><Button onClick={() => setEvidenceOpen(true)}>Inspect evidence</Button><span className="meta">Method {valuation.methodVersion} / {tierExplanation[valuation.tier]}</span></div>
            </section>
          </Panel>
          <section className="card" aria-labelledby="sc-title">
            <h2 className="h3" id="sc-title">Acquisition scenario</h2>
            <dl className="kv mt-4">
              <div><dt>Offer</dt><dd>{formatMoney(scenario.offer)}</dd></div>
              <div><dt>Landed incl. costs</dt><dd>{formatMoney(totals.landed)}</dd></div>
              <div><dt>Target resale</dt><dd>{formatMoney(scenario.targetResale)}</dd></div>
              <div><dt>Estimated gross</dt><dd className="tone-accent">{formatLakh2(totals.gross)}</dd></div>
              <div><dt>Est. contribution</dt><dd className={totals.contribution < 0 ? "tone-danger" : "tone-accent"}>{formatLakh2(totals.contribution)}</dd></div>
            </dl>
            <Button className="mt-4 btn-block" onClick={() => url.set({ tab: "costs" })}>Edit cost assumptions</Button>
          </section>
        </div>
      ) : null}

      {tab === "comparables" ? (
        <section className="stack" role="tabpanel" aria-labelledby="lst-comparables">
          <div className="table-wrap"><table className="data-table" aria-label="Comparable listings">
            <thead><tr><th>Listing</th><th className="num">Asking</th><th className="num">Year</th><th className="num">km</th><th>City</th><th>Observed</th><th><span className="sr-only">Open</span></th></tr></thead>
            <tbody>{comps.map((c) => <tr key={c.id}><td><span className="row-title">{c.id}</span><span className="sub">{c.source}</span></td><td className="num">{formatMoney(c.asking)}</td><td className="num">{c.year}</td><td className="num">{formatKm(c.km)}</td><td>{c.city}</td><td>{formatShortDateTime(c.observedAt)}</td><td><Button size="sm" variant="ghost" onClick={() => { setEvidenceRow(c.id); setEvidenceOpen(true); }}>Evidence</Button></td></tr>)}</tbody></table></div>
          <p className="meta">{comps.length} comparable listings used. {exclusions.length} candidates excluded: {exclusions.map((e) => e.reason).join("; ") || "none"}.</p>
        </section>
      ) : null}

      {tab === "history" ? (
        <section className="card" role="tabpanel" aria-labelledby="lst-history">
          <h2 className="h3">Observed asking price</h2>
          <div className="table-wrap fit mt-4"><table className="data-table dense"><thead><tr><th>Observed</th><th className="num">Asking</th><th>Note</th></tr></thead>
            <tbody>{history.map((h) => <tr key={h.at}><td>{formatShortDateTime(h.at)}</td><td className="num">{h.ask === null ? MISSING : formatMoney(h.ask)}</td><td className="muted">{h.ask === null ? "Not observed (a gap, not a zero)" : "Observed ask"}</td></tr>)}</tbody></table></div>
        </section>
      ) : null}

      {tab === "costs" ? (
        <section className="card stack" role="tabpanel" aria-labelledby="lst-costs">
          <h2 className="h3">Cost inputs (₹ lakh)</h2>
          <p className="muted">Edits recalculate the local draft immediately. Save scenario stores the version and assumptions. Scenarios never enter the inventory ledger.</p>
          <div className="form-grid">
            <TextField label="Target offer (₹ L)" inputMode="decimal" value={offer} onChange={(e) => setOffer(e.target.value)} />
            <TextField label="Transport (₹ L)" inputMode="decimal" value={costs.transport} onChange={(e) => setCosts({ ...costs, transport: e.target.value })} />
            <TextField label="Inspection (₹ L)" inputMode="decimal" value={costs.inspection} onChange={(e) => setCosts({ ...costs, inspection: e.target.value })} />
            <TextField label="Refurbishment (₹ L)" inputMode="decimal" value={costs.refurbishment} onChange={(e) => setCosts({ ...costs, refurbishment: e.target.value })} />
            <TextField label="Purchase fees (₹ L)" inputMode="decimal" value={costs.fees} onChange={(e) => setCosts({ ...costs, fees: e.target.value })} />
            <TextField label="Holding and selling (₹ L)" inputMode="decimal" value={costs.holdingSelling} onChange={(e) => setCosts({ ...costs, holdingSelling: e.target.value })} help="Shown separately from landed cost." />
            <TextField label="Target resale (₹ L)" inputMode="decimal" value={costs.targetResale} onChange={(e) => setCosts({ ...costs, targetResale: e.target.value })} />
          </div>
          <dl className="kv"><div><dt>Landed incl. costs</dt><dd title={formatExact(totals.landed)}>{formatMoney(totals.landed)}</dd></div><div><dt>Estimated gross</dt><dd className={totals.gross < 0 ? "tone-danger" : "tone-accent"}>{formatLakh2(totals.gross)}</dd></div><div><dt>Est. contribution (after holding/selling)</dt><dd className={totals.contribution < 0 ? "tone-danger" : "tone-accent"}>{formatLakh2(totals.contribution)}</dd></div></dl>
          <div className="row-flex"><Button variant="primary" disabled={!can("acquisition.review")} reason={!can("acquisition.review") ? "Saving needs Owner, Manager or Inventory access." : undefined} onClick={() => {
            const result = run((s, a) => saveScenario(s, a, { listingId: listing.id, ...scenario }));
            if (result.ok) toast(`Scenario version ${result.scenario.version} saved with its assumptions.`); else toast(result.message, "error");
          }}>Save scenario</Button>{saved ? <span className="meta">Latest saved: version {saved.version} by {saved.by}, {formatShortDateTime(saved.savedAt)}</span> : null}</div>
        </section>
      ) : null}

      {tab === "documents" ? (
        <section className="card" role="tabpanel" aria-labelledby="lst-documents">
          <h2 className="h3">Documents and history</h2>
          <dl className="kv mt-4"><div><dt>Ownership history</dt><dd>Not provided</dd></div><div><dt>Inspection report</dt><dd>Not provided</dd></div><div><dt>Service records</dt><dd>Not provided</dd></div></dl>
          <p className="meta mt-4">Missing history is never shown as a clean history. Documents appear only when the licensed source supplies them.</p>
        </section>
      ) : null}
      <p className="footnote">Scenario assumptions are illustrative. Documents and history are not verified unless explicitly supplied.</p>

      <Evidence open={evidenceOpen} onClose={() => { setEvidenceOpen(false); setEvidenceRow(null); }} listing={listing} comps={comps} exclusions={exclusions} focusId={evidenceRow} valuationTier={valuation.tier} method={valuation.methodVersion} />
      <ReviewDialog open={reviewOpen} onClose={() => setReviewOpen(false)} listing={listing} scenario={scenario} totals={totals} tier={valuation.tier} n={valuation.n} />
      <Dialog open={contactOpen} onClose={() => setContactOpen(false)} title="Contact source" description="Entitlement check: your role may use the authorised source destination." footer={<><Button onClick={() => setContactOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => { const r = run((s, a) => logContactIntent(s, a, listing.id)); if (r.ok) toast("Contact intent logged. No contact outcome is recorded: log it yourself after you speak to the source."); setContactOpen(false); }}>Log intent and continue</Button></>}>
        <Notice tone="warn">Illustrative listings carry no source contact. In production this opens the authorised source destination or reveals the allowed business contact after an entitlement check.</Notice>
        <p className="muted">Continuing logs the intent to contact. It never claims that contact succeeded.</p>
      </Dialog>
      <Lightbox index={lightbox} onClose={() => setLightbox(null)} onChange={(i) => { setLightbox(i); setImage(i); }} />
    </div>
  );
}

function RangeStrip({ low, high, estimate, asking }: { low: number | null; high: number | null; estimate: number | null; asking: number }) {
  if (low === null || high === null || estimate === null) return <p className="muted mt-4">Range suppressed: insufficient evidence.</p>;
  const min = Math.min(low, asking) - lakh(1);
  const max = Math.max(high, asking) + lakh(1);
  const pos = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  return (
    <div className="range-strip" role="img" aria-label={`Comparable asking range ${formatMoney(low)} to ${formatMoney(high)}, estimate ${formatMoney(estimate)}, this listing ${formatMoney(asking)}`}>
      <div className="range-track"><div className="range-band" style={{ left: pos(low), width: `calc(${pos(high)} - ${pos(low)})` }} /><span className="range-tick est" style={{ left: pos(estimate) }} /><span className="range-tick ask" style={{ left: pos(asking) }} /></div>
      <div className="range-labels"><span style={{ left: pos(low) }}>{formatMoney(low)}<small>Lower range</small></span><span style={{ left: pos(estimate) }}>{formatMoney(estimate)}<small>Median</small></span><span style={{ left: pos(high) }}>{formatMoney(high)}<small>Upper range</small></span></div>
    </div>
  );
}

function Evidence({ open, onClose, listing, comps, exclusions, focusId, valuationTier, method }: { open: boolean; onClose: () => void; listing: (typeof LISTINGS)[number]; comps: ReturnType<typeof comparablesFor>["items"]; exclusions: { id: string; reason: string }[]; focusId: string | null; valuationTier: string; method: string }) {
  const [windowDays, setWindowDays] = useState(14);
  const [kmBand, setKmBand] = useState<"all" | "40-80">("all");
  const [ownerMax, setOwnerMax] = useState(3);
  useEffect(() => { if (open) { setWindowDays(14); setKmBand("all"); setOwnerMax(3); } }, [open]);
  const filtered = comps.filter((c) => c.ageDays <= windowDays && c.owners <= ownerMax && (kmBand === "all" || (c.km >= 40000 && c.km <= 80000)));
  const asks = filtered.map((c) => c.asking);
  const tier = evidenceTier(filtered.length, 0.86, windowDays);
  const changed = windowDays !== 14 || kmBand !== "all" || ownerMax !== 3;
  return (
    <Drawer open={open} onClose={onClose} size="w560" title="Comparable evidence" description={`${listing.id} / ${comps.length} matched listings / method ${method}`} footer={<Button variant="primary" onClick={onClose}>Close</Button>}>
      <div className="form-grid">
        <div className="field"><label htmlFor="ev-window">Observation window</label><select id="ev-window" className="select" value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))}><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option></select></div>
        <div className="field"><label htmlFor="ev-km">Odometer band</label><select id="ev-km" className="select" value={kmBand} onChange={(e) => setKmBand(e.target.value as typeof kmBand)}><option value="all">All km</option><option value="40-80">40,000-80,000 km</option></select></div>
        <div className="field"><label htmlFor="ev-owner">Owner band</label><select id="ev-owner" className="select" value={ownerMax} onChange={(e) => setOwnerMax(Number(e.target.value))}><option value={1}>1 owner</option><option value={2}>Up to 2 owners</option><option value={3}>Any</option></select></div>
      </div>
      {changed ? <Notice tone="accent" role="status">Local cohort (not the model estimate): n = {filtered.length}, median {formatMoney(median(asks))}, {tier === "Insufficient" ? "Insufficient evidence, descriptive only" : `${tier} evidence`}.</Notice> : <Notice role="status">Model cohort. Evidence tier: {valuationTier}.</Notice>}
      <div className="table-wrap fit"><table className="data-table dense"><thead><tr><th>Listing</th><th className="num">Asking</th><th>Attributes</th><th>Observed</th></tr></thead>
        <tbody>{filtered.map((c) => <tr key={c.id} aria-current={focusId === c.id ? "true" : undefined} style={focusId === c.id ? { outline: "2px solid var(--accent)" } : undefined}><td><span className="row-title">{c.id}</span><span className="sub">{c.source}</span></td><td className="num">{formatMoney(c.asking)}</td><td><span className="sub">{c.year} / {formatKm(c.km)} km / {c.owners} owner(s)</span><span className="sub">Matched: {c.matchedAttributes.join(", ")}</span></td><td>{formatShortDateTime(c.observedAt)}<span className="sub">{daysBetween(c.observedAt, SNAPSHOT_AT)} d ago</span></td></tr>)}</tbody></table></div>
      <div className="card tight"><h3 className="h3">Exclusions ({exclusions.length})</h3><ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>{exclusions.length ? exclusions.map((e) => <li key={e.id}>{e.id}: {e.reason}</li>) : <li>None</li>}</ul></div>
      <p className="meta">Asking prices are listing asks, not transactions. Tier rule: {tierExplanation[tier]}.</p>
    </Drawer>
  );
}

function ReviewDialog({ open, onClose, listing, scenario, totals, tier, n }: { open: boolean; onClose: () => void; listing: (typeof LISTINGS)[number]; scenario: { offer: number; transport: number; inspection: number; refurbishment: number; fees: number; holdingSelling: number; targetResale: number }; totals: ReturnType<typeof scenarioTotals>; tier: string; n: number }) {
  const { run } = useWorkspace();
  const toast = useToast();
  const [offer, setOffer] = useState("");
  const [rationale, setRationale] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (open) { setOffer(String(scenario.offer / lakh(1))); setRationale(""); setErrors({}); } }, [open, scenario.offer]);
  return (
    <Dialog open={open} onClose={onClose} dirty={Boolean(rationale)} title="Create acquisition review" description="A draft request for a distinct approver. It does not purchase or reserve the vehicle." size="w640"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => {
        const target = parseLakhInput(offer);
        const result = run((s, a) => createAcquisitionReview(s, a, listing, { listingId: listing.id, ...scenario, offer: target ?? 0 }, rationale));
        if (!result.ok) { setErrors(result.fields ?? { form: result.message }); return; }
        toast(`Draft ${result.review.id} created. Submit it to route it to an approver.`); onClose();
      }}>Create draft request</Button></>}>
      <FormSummary errors={errors} />
      <TextField label="Target offer (₹ lakh)" required inputMode="decimal" value={offer} onChange={(e) => setOffer(e.target.value)} error={errors.offer} data-autofocus />
      <dl className="kv"><div><dt>Cost scenario: landed</dt><dd>{formatMoney(totals.landed)}</dd></div><div><dt>Target resale</dt><dd>{formatMoney(scenario.targetResale)}</dd></div><div><dt>Estimated gross</dt><dd>{formatLakh2(totals.gross)}</dd></div><div><dt>Evidence snapshot</dt><dd><EvidenceBadge tier={tier as "High" | "Moderate" | "Insufficient"} /> n = {n}</dd></div></dl>
      <TextArea label="Rationale" required value={rationale} onChange={(e) => setRationale(e.target.value)} error={errors.rationale} help="Why this vehicle, at this price, for this branch." />
    </Dialog>
  );
}

function Lightbox({ index, onClose, onChange }: { index: number | null; onClose: () => void; onChange: (i: number) => void }) {
  return (
    <Dialog open={index !== null} onClose={onClose} title={`Gallery: image ${(index ?? 0) + 1} of 4`} size="w960" footer={<><Button onClick={() => onChange(((index ?? 0) + 3) % 4)}>Previous</Button><Button onClick={() => onChange(((index ?? 0) + 1) % 4)}>Next</Button><Button variant="primary" onClick={onClose}>Close</Button></>}>
      <div onKeyDown={(e) => { if (e.key === "ArrowRight") onChange(((index ?? 0) + 1) % 4); if (e.key === "ArrowLeft") onChange(((index ?? 0) + 3) % 4); }}><VehicleArt label={`Schematic vehicle image ${(index ?? 0) + 1}`} /></div>
    </Dialog>
  );
}

export { notFound };
