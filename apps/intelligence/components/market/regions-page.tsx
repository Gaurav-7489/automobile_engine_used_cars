"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { withBase } from "@/lib/base-path";
import type { EvidenceTier, RegionStat } from "@/lib/domain";
import { evidenceTier } from "@/lib/evidence";
import { CITIES } from "@/lib/fixtures/market";
import { formatLakh2, formatMoney, formatPercent, formatShortDateTime, lakh, MISSING, parseLakhInput } from "@/lib/format";
import { DEFAULT_COHORT, type CohortFilter } from "@/lib/market";
import { saveScenario } from "@/lib/actions";
import { downloadCsv } from "@/lib/export";
import { SNAPSHOT_ID } from "@/lib/time";
import { RangeBars } from "../charts";
import { Dialog, Drawer } from "../overlay";
import { Panel } from "../panel";
import { useToast } from "../toast";
import { Badge, Button, EmptyState, ErrorPanel, Notice, PageHead, PanelSkeleton, SelectField, Skeleton, TextField } from "../ui";
import { useScopedHref, useUrlState, useWorkspace } from "../workspace";
import { EvidenceBadge } from "./common";

type Response = { data: { cohort: CohortFilter; regions: RegionStat[]; excluded_unknown_match_fields: number; computed_from_listings: boolean; caveat: string }; snapshot_id: string };

const STATE_OF: Record<string, string> = Object.fromEntries(CITIES.map((c) => [c.region, `${c.city}, ${c.state}`]));
const cohortToQuery = (c: CohortFilter, base: string): string => {
  const p = new URLSearchParams({ make: c.make, model: c.model, variant: c.variant, fuel: c.fuel, transmission: c.transmission, yearFrom: String(c.yearFrom), yearTo: String(c.yearTo), kmMin: String(c.kmMin), kmMax: String(c.kmMax), owners: String(c.ownersMax), window: String(c.windowDays), base });
  return p.toString();
};

export function RegionsPage() {
  const { can, run, demoState } = useWorkspace();
  const url = useUrlState();
  const href = useScopedHref();
  const router = useRouter();
  const toast = useToast();
  const base = url.get("base", "Kochi");
  const selectedRegion = url.get("region", "Bengaluru");
  const cohort = useMemo<CohortFilter>(() => ({
    make: url.get("make", DEFAULT_COHORT.make), model: url.get("model", DEFAULT_COHORT.model), variant: url.get("variant", DEFAULT_COHORT.variant), fuel: url.get("fuel", DEFAULT_COHORT.fuel), transmission: url.get("transmission", DEFAULT_COHORT.transmission),
    yearFrom: Number(url.get("yearFrom", String(DEFAULT_COHORT.yearFrom))), yearTo: Number(url.get("yearTo", String(DEFAULT_COHORT.yearTo))), kmMin: Number(url.get("kmMin", String(DEFAULT_COHORT.kmMin))), kmMax: Number(url.get("kmMax", String(DEFAULT_COHORT.kmMax))),
    ownersMax: Number(url.get("owners", String(DEFAULT_COHORT.ownersMax))), windowDays: Number(url.get("window", String(DEFAULT_COHORT.windowDays))),
  }), [url]);
  const [data, setData] = useState<Response | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [drawerRegion, setDrawerRegion] = useState<string | null>(null);
  const cohortKey = cohortToQuery(cohort, base);

  useEffect(() => {
    if (demoState === "loading") { setStatus("loading"); return; }
    if (demoState === "error") { setStatus("error"); return; }
    const controller = new AbortController();
    setStatus("loading");
    fetch(withBase(`/api/market/regions?${cohortKey}`),{ signal: controller.signal })
      .then(async (r) => { const body = await r.json(); if (!r.ok) throw new Error(body?.error?.message); setData(body); setStatus("ready"); })
      .catch((e) => { if ((e as Error).name !== "AbortError") setStatus("error"); });
    return () => controller.abort();
  }, [cohortKey, attempt, demoState]);

  const regions = data?.data.regions ?? [];
  const baseStat = regions.find((r) => r.region === base);
  const chosen = regions.find((r) => r.region === selectedRegion) ?? regions.find((r) => r.region !== base && r.status === "ok");
  const [transport, setTransport] = useState("");
  const [fees, setFees] = useState("");
  const [refurb, setRefurb] = useState("0");
  useEffect(() => { if (chosen) { setTransport(String(chosen.transport / lakh(1))); setFees(String(chosen.fees / lakh(1))); setRefurb("0"); } }, [chosen?.region, data]); // eslint-disable-line react-hooks/exhaustive-deps
  const manualTransport = chosen ? parseLakhInput(transport) !== chosen.transport : false;
  const scenario = useMemo(() => {
    if (!chosen || chosen.median === null || !baseStat || baseStat.median === null) return null;
    const t = parseLakhInput(transport) ?? 0; const f = parseLakhInput(fees) ?? 0; const r = parseLakhInput(refurb) ?? 0;
    const landed = chosen.median + t + f + r;
    return { median: chosen.median, transport: t, fees: f, refurb: r, landed, gap: baseStat.median - landed };
  }, [chosen, baseStat, transport, fees, refurb]);

  const tierOf = (r: RegionStat): EvidenceTier => (r.status === "unavailable" ? "Insufficient" : evidenceTier(r.n, r.completeness, r.freshestDays));
  const baseMedian = baseStat?.median ?? null;
  const delta = (r: RegionStat) => (r.median === null || baseMedian === null || baseMedian === 0 ? null : ((r.median - baseMedian) / baseMedian) * 100);
  const lowSample = regions.some((r) => r.status === "ok" && r.n < 10);
  const noRegions = status === "ready" && regions.every((r) => r.status === "unavailable");
  const cohortLine = `${cohort.yearFrom}-${cohort.yearTo} / ${cohort.kmMin.toLocaleString("en-IN")}-${cohort.kmMax.toLocaleString("en-IN")} km / 1-${cohort.ownersMax} owners / Observed within ${cohort.windowDays} days`;

  const exportCsv = () => {
    downloadCsv(`regional-comparison-${SNAPSHOT_ID}.csv`, [["region", "n", "median_ask_rupees", "q1_rupees", "q3_rupees", "delta_to_base_pct", "evidence_tier", "observed_at"], ...regions.map((r) => [r.region, String(r.n), r.median === null ? "" : String(r.median / 100), r.q1 === null ? "" : String(r.q1 / 100), r.q3 === null ? "" : String(r.q3 / 100), delta(r) === null ? "" : delta(r)!.toFixed(1), tierOf(r), r.observedAt ?? ""])],
      [`# Asking-price comparison, not transaction prices. Units: rupees. Base region: ${base}`, `# Cohort: ${cohort.make} ${cohort.model} ${cohort.variant} ${cohort.fuel} ${cohort.transmission} ${cohortLine}`, `# Observation window ${cohort.windowDays} days / unknown-match exclusions ${data?.data.excluded_unknown_match_fields ?? 0} / method valuation-v1.0 / snapshot ${SNAPSHOT_ID}`]);
    toast("Export includes n, observation window, exclusions, units and method version.");
  };

  const select = (region: string) => { url.set({ region }); setDrawerRegion(region); };
  const openListings = () => {
    if (!chosen) return;
    const p = new URLSearchParams({ q: `${cohort.make} ${cohort.model} ${cohort.variant}`, region: chosen.region, yearFrom: String(cohort.yearFrom), yearTo: String(cohort.yearTo), fuel: cohort.fuel, transmission: cohort.transmission, variant: cohort.variant, kmMax: String(cohort.kmMax), owners: String(cohort.ownersMax), observed: String(cohort.windowDays) });
    router.push(href(`/app/market?${p.toString()}`));
  };

  return (
    <div className="page">
      <PageHead title="Regional price comparison" lead="Like-for-like asking-price cohorts with transport-adjusted scenarios." actions={<Button onClick={exportCsv} disabled={status !== "ready" || !can("market.export")} reason={status !== "ready" ? "Export is available once the matching snapshot is ready." : !can("market.export") ? "Export needs Owner, Manager or Marketing access." : undefined}>Export</Button>} />

      <section className="card cohort-card" aria-labelledby="cohort-title">
        <button type="button" className="cohort-open" onClick={() => setEditOpen(true)} aria-label="Edit cohort">
          <h2 className="h3" id="cohort-title">{cohort.make} {cohort.model} {cohort.variant} / {cohort.fuel} / {cohort.transmission}</h2>
          <span className="muted">{cohortLine}</span>
        </button>
        <div className="row-flex"><Button variant="primary" onClick={() => setAttempt((a) => a + 1)}>Apply</Button><Button onClick={() => url.set({ make: null, model: null, variant: null, fuel: null, transmission: null, yearFrom: null, yearTo: null, kmMin: null, kmMax: null, owners: null, window: null })}>Reset</Button></div>
      </section>

      <div className="row-flex">
        <button type="button" className="chip accent" onClick={() => setEditOpen(true)} aria-label={`Base region ${base}. Change base region`}>Base region: {base}</button>
        <span className="muted">Regional medians of listing asks / not transaction prices</span>
      </div>

      {status === "error" ? <ErrorPanel title="Regional evidence could not load" message="Partial regions show unavailable badges, never zero bars. A failed route quote permits a clearly marked manual transport estimate." onRetry={() => { url.set({ demo_state: null }); setAttempt((a) => a + 1); }} /> : null}
      {noRegions ? <EmptyState title="No qualifying regions" actions={<Button onClick={() => setEditOpen(true)}>Widen km or year band</Button>}>The cohort is too restrictive for any region. Matching is never relaxed silently: widen the km or year band yourself.</EmptyState> : null}

      {status !== "error" && !noRegions ? (
        <div className="regions-grid">
          <section className="card chart-card" aria-labelledby="rg-title">
            <h2 className="h3" id="rg-title">Matched regional median and IQR</h2>
            <p className="meta">Asking-price comparisons. Adjusted estimate is a separate model output. Horizontal axis: asking price, ₹ lakh.</p>
            <Panel title="Regional chart" rows={5}>
              {status === "loading" && !data ? <div className="stack-sm">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} h={28} />)}</div> : (
                <>
                  <div className="only-desktop"><RangeBars axisMin={lakh(20)} axisMax={lakh(32)} format={(v) => `₹${Math.round(v / lakh(1))} L`} selected={chosen?.region} onSelect={select}
                    rows={regions.map((r) => ({ key: r.region, label: r.region, sub: r.status === "ok" ? `n=${r.n}` : "n unavailable", median: r.median, q1: r.q1, q3: r.q3, display: formatMoney(r.median), unavailable: r.status === "unavailable" }))} /></div>
                  <ul className="region-cards only-mobile" aria-label="Regions">
                    {regions.map((r) => (
                      <li key={r.region}><button type="button" className="card tight region-card" onClick={() => { select(r.region); setSheetOpen(true); }} disabled={r.status === "unavailable"} aria-label={`${r.region}, n ${r.n}, ${formatMoney(r.median)} median asking`}>
                        <span className="spread"><strong>{r.region} / n{r.n}</strong><span aria-hidden="true">&gt;</span></span>
                        <span className="tone-accent">{r.status === "ok" ? `${formatMoney(r.median)} median asking` : "Unavailable"}</span>
                        <span className="meta">{r.status === "ok" ? `IQR ${formatMoney(r.q1)}-${formatMoney(r.q3).replace("₹", "")}${r.n < 10 ? " / Insufficient evidence" : ""}` : "No qualifying listings"}</span>
                      </button></li>
                    ))}
                  </ul>
                </>
              )}
            </Panel>
          </section>
          <section className="card only-desktop" aria-labelledby="sc-title">
            {status === "loading" && !data ? <PanelSkeleton rows={5} /> : <Scenario region={chosen} base={base} scenario={scenario} transport={transport} setTransport={setTransport} fees={fees} setFees={setFees} refurb={refurb} setRefurb={setRefurb} manual={manualTransport} onOpen={openListings}
              onSave={() => { if (!chosen || !scenario) return; const r = run((s, a) => saveScenario(s, a, { listingId: `REG-${chosen.region.toUpperCase()}`, offer: scenario.median, transport: scenario.transport, inspection: 0, refurbishment: scenario.refurb, fees: scenario.fees, holdingSelling: 0, targetResale: baseStat?.median ?? 0 })); if (r.ok) toast(`Scenario saved with region ${chosen.region} and the evidence snapshot.`); else toast(r.message, "error"); }} />}
          </section>
        </div>
      ) : null}

      {status !== "error" && !noRegions ? (
        <div className="table-wrap only-desktop">
          <table className="data-table" aria-label="Regional evidence">
            <thead><tr><th style={{ width: 200 }}>Region</th><th className="num" style={{ width: 80 }}>n</th><th className="num" style={{ width: 180 }}>Median ask</th><th style={{ width: 200 }}>IQR</th><th className="num" style={{ width: 160 }}>Delta to base</th><th style={{ width: 180 }}>Freshness</th><th style={{ width: 160 }}>Evidence</th></tr></thead>
            <tbody>
              {regions.map((r) => (
                <tr key={r.region} aria-selected={chosen?.region === r.region} style={chosen?.region === r.region ? { outline: "1px solid var(--accent)" } : undefined}>
                  <td><button type="button" className="row-title" onClick={() => select(r.region)}>{r.region}</button><span className="sub">{STATE_OF[r.region] ?? r.state}</span></td>
                  <td className="num">{r.status === "ok" ? r.n : <Badge tone="warn">Unavailable</Badge>}</td><td className="num">{formatMoney(r.median)}</td><td>{r.q1 === null ? MISSING : `${formatMoney(r.q1)}-${formatMoney(r.q3).replace("₹", "")}`}</td>
                  <td className="num">{r.region === base ? "0.0% (base)" : delta(r) === null ? MISSING : <span className={delta(r)! < 0 ? "tone-accent" : ""}>{formatPercent(delta(r), { signed: true })}</span>}</td>
                  <td>{r.observedAt ? `Within ${r.freshestDays}d` : MISSING}<span className="sub">{formatShortDateTime(r.observedAt)}</span></td><td>{r.status === "ok" ? <EvidenceBadge tier={tierOf(r)} /> : <Badge tone="warn">Unavailable</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {lowSample ? <p className="footnote">Low sample n&lt;10: descriptive only / no opportunity rank. All figures illustrative.</p> : <p className="footnote neutral">Evidence tiers follow the proposed deterministic rule. All figures illustrative.</p>}

      <Cohort open={editOpen} onClose={() => setEditOpen(false)} cohort={cohort} base={base} onApply={(c, b) => { url.set({ make: c.make, model: c.model, variant: c.variant, fuel: c.fuel, transmission: c.transmission, yearFrom: c.yearFrom, yearTo: c.yearTo, kmMin: c.kmMin, kmMax: c.kmMax, owners: c.ownersMax, window: c.windowDays, base: b === "Kochi" ? null : b }); setEditOpen(false); }} />
      <Drawer open={Boolean(drawerRegion) && !sheetOpen} onClose={() => setDrawerRegion(null)} title={`${drawerRegion ?? ""} matched listings`} description="Evidence behind the regional median." footer={<><Button onClick={() => setDrawerRegion(null)}>Close</Button><Button variant="primary" onClick={openListings}>Open matching listings</Button></>}>
        {(() => { const r = regions.find((x) => x.region === drawerRegion); return r ? <dl className="kv"><div><dt>Matched listings</dt><dd>n = {r.n}</dd></div><div><dt>Median ask</dt><dd>{formatMoney(r.median)}</dd></div><div><dt>IQR</dt><dd>{r.q1 === null ? MISSING : `${formatMoney(r.q1)}-${formatMoney(r.q3)}`}</dd></div><div><dt>Freshest observation</dt><dd>{formatShortDateTime(r.observedAt)}</dd></div><div><dt>Evidence</dt><dd><EvidenceBadge tier={tierOf(r)} /></dd></div></dl> : null; })()}
        {chosen?.n !== undefined && chosen.n < 10 ? <Notice tone="warn">Insufficient evidence: median is descriptive only. No ranking or recommendation.</Notice> : null}
      </Drawer>
      <Dialog open={sheetOpen} onClose={() => setSheetOpen(false)} title={`${chosen?.region ?? ""} > ${base} scenario`} size="w640" footer={<Button variant="primary" onClick={() => { setSheetOpen(false); openListings(); }}>Open matching listings</Button>}>
        <Scenario region={chosen} base={base} scenario={scenario} transport={transport} setTransport={setTransport} fees={fees} setFees={setFees} refurb={refurb} setRefurb={setRefurb} manual={manualTransport} onOpen={openListings} compact />
      </Dialog>
    </div>
  );
}

function Scenario({ region, base, scenario, transport, setTransport, fees, setFees, refurb, setRefurb, manual, onOpen, onSave, compact }: {
  region: RegionStat | undefined; base: string; scenario: { median: number; transport: number; fees: number; refurb: number; landed: number; gap: number } | null; transport: string; setTransport: (v: string) => void; fees: string; setFees: (v: string) => void; refurb: string; setRefurb: (v: string) => void; manual: boolean; onOpen: () => void; onSave?: () => void; compact?: boolean;
}) {
  if (!region || region.status === "unavailable" || !scenario) return <EmptyState title="Choose a region">Select a region with qualifying listings to see a transport-adjusted scenario.</EmptyState>;
  return (
    <div className="stack">
      {!compact ? <h2 className="h3" id="sc-title">{region.region} &gt; {base} / scenario</h2> : null}
      <dl className="kv">
        <div><dt>Regional median ask</dt><dd>{formatMoney(scenario.median)}</dd></div>
        <div><dt>Transport estimate{manual ? " (manual)" : ""}</dt><dd>{formatLakh2(scenario.transport)}</dd></div>
        <div><dt>Fees estimate</dt><dd>{formatLakh2(scenario.fees)}</dd></div>
        <div><dt>Landed scenario</dt><dd>{formatMoney(scenario.landed)}</dd></div>
        <div><dt>Gap to {base} median</dt><dd>{formatLakh2(scenario.gap)}</dd></div>
      </dl>
      <div className="form-grid">
        <TextField label={manual ? "Transport (₹ L, manual estimate)" : "Transport (₹ L)"} inputMode="decimal" value={transport} onChange={(e) => setTransport(e.target.value)} help={manual ? "Manual estimate: not a route quote." : undefined} />
        <TextField label="Fees (₹ L)" inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value)} />
        <TextField label="Refurbishment (₹ L)" inputMode="decimal" value={refurb} onChange={(e) => setRefurb(e.target.value)} className="span-2" />
      </div>
      <p className="footnote">Gap is not estimated profit.</p>
      {region.n < 10 ? <Notice tone="warn">Insufficient evidence for this region: descriptive only, no recommendation.</Notice> : null}
      <Button variant="primary" onClick={onOpen}>Open matching listings</Button>
      {onSave ? <Button onClick={onSave}>Save scenario</Button> : null}
    </div>
  );
}

function Cohort({ open, onClose, cohort, base, onApply }: { open: boolean; onClose: () => void; cohort: CohortFilter; base: string; onApply: (c: CohortFilter, base: string) => void }) {
  const [form, setForm] = useState({ ...cohort });
  const [baseRegion, setBaseRegion] = useState(base);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (open) { setForm({ ...cohort }); setBaseRegion(base); setErrors({}); } }, [open, cohort, base]);
  const num = (key: keyof CohortFilter) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: Number(e.target.value.replace(/\D/g, "")) });
  const apply = () => {
    const next: Record<string, string> = {};
    if (!form.make || !form.model) next.make = "Enter the make and model.";
    if (form.yearFrom > form.yearTo) next.yearFrom = "The first year cannot be after the last year.";
    if (form.kmMin > form.kmMax) next.kmMin = "The minimum km cannot exceed the maximum.";
    if (![7, 14, 30].includes(form.windowDays)) next.windowDays = "Choose a 7, 14 or 30 day window.";
    if (Object.keys(next).length) { setErrors(next); return; }
    onApply(form, baseRegion);
  };
  return (
    <Drawer open={open} onClose={onClose} dirty={JSON.stringify(form) !== JSON.stringify(cohort) || baseRegion !== base} size="w560" title="Edit cohort and base region" description="Apply validates the cohort and refreshes the chart and table together." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={apply}>Apply</Button></>}>
      <div className="form-grid">
        <TextField label="Make" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} error={errors.make} />
        <TextField label="Model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
        <TextField label="Variant" value={form.variant} onChange={(e) => setForm({ ...form, variant: e.target.value })} />
        <SelectField label="Fuel" value={form.fuel} onChange={(e) => setForm({ ...form, fuel: e.target.value })} options={["Diesel", "Petrol"]} />
        <SelectField label="Transmission" value={form.transmission} onChange={(e) => setForm({ ...form, transmission: e.target.value })} options={["Automatic", "Manual"]} />
        <SelectField label="Observed within" value={String(form.windowDays)} onChange={(e) => setForm({ ...form, windowDays: Number(e.target.value) })} options={[{ value: "7", label: "7 days" }, { value: "14", label: "14 days" }, { value: "30", label: "30 days" }]} error={errors.windowDays} />
        <TextField label="Year from" inputMode="numeric" value={String(form.yearFrom)} onChange={num("yearFrom")} error={errors.yearFrom} />
        <TextField label="Year to" inputMode="numeric" value={String(form.yearTo)} onChange={num("yearTo")} />
        <TextField label="km from" inputMode="numeric" value={String(form.kmMin)} onChange={num("kmMin")} error={errors.kmMin} />
        <TextField label="km to" inputMode="numeric" value={String(form.kmMax)} onChange={num("kmMax")} />
        <SelectField label="Owners (up to)" value={String(form.ownersMax)} onChange={(e) => setForm({ ...form, ownersMax: Number(e.target.value) })} options={[{ value: "1", label: "1 owner" }, { value: "2", label: "1-2 owners" }, { value: "3", label: "1-3 owners" }]} />
        <SelectField label="Base region" value={baseRegion} onChange={(e) => setBaseRegion(e.target.value)} options={CITIES.map((c) => ({ value: c.region, label: `${c.city}, ${c.state}` }))} help="City-state labels disambiguate identical city names." />
      </div>
    </Drawer>
  );
}
