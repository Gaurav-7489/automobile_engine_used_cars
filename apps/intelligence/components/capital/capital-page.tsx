"use client";

import { useEffect, useMemo, useState } from "react";
import { proposeCorrection, saleStateNote } from "@/lib/actions";
import type { Sale, Vehicle } from "@/lib/domain";
import { downloadBlob, downloadCsv, makePdf } from "@/lib/export";
import { AGE_BUCKETS, isRealized, landedCost, realizedMetrics, realizedProfit, saleGross, stockAgeDays, stockMetrics } from "@/lib/finance";

import { formatDate, formatExact, formatLakh2, formatLakhPlain, formatMoney, MISSING, monthKey, monthLabel, monthName } from "@/lib/format";
import { daysToSale, inScope, monthlyProfit } from "@/lib/selectors";
import { getMonths, REPORT_SNAPSHOT_ID, SNAPSHOT_AT } from "@/lib/time";
import { HBars, SimpleBars } from "../charts";
import { Dialog, Drawer, Menu } from "../overlay";
import { Gate, Panel } from "../panel";
import { useToast } from "../toast";
import { Badge, Button, EmptyState, InfoTip, Kpi, Notice, PageHead, SelectField, TextArea, TextField } from "../ui";
import { useUrlState, useWorkspace } from "../workspace";
import { scenarioTotals } from "@/lib/finance";
import { lakh, parseLakhInput } from "@/lib/format";

type Population = null | "stock" | "available" | "realized" | `age:${string}`;

export function CapitalPage() {
  return <Gate capability="capital.view" title="Capital and profit is restricted"><Capital /></Gate>;
}

function Capital() {
  const { state, scope, can, run, demoState } = useWorkspace();
  const url = useUrlState();
  const toast = useToast();
  const from = url.get("from", getMonths()[0]);
  const to = url.get("to", getMonths()[getMonths().length - 1]);
  const completeness = url.get("cost", "all");
  const [population, setPopulation] = useState<Population>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [defsOpen, setDefsOpen] = useState(url.get("definition") !== "");
  const [scenarioFor, setScenarioFor] = useState<string | "new" | null>(null);
  const [correction, setCorrection] = useState<Sale | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const stock = useMemo(() => inScope(state.vehicles, scope.ids).filter((v) => (completeness === "complete" ? v.costComplete : completeness === "incomplete" ? !v.costComplete : true)), [state.vehicles, scope.ids, completeness]);
  const allSales = useMemo(() => inScope(state.sales, scope.ids).filter((s) => { const key = monthKey(s.closedAt); return key >= from && key <= to; }), [state.sales, scope.ids, from, to]);
  const metrics = useMemo(() => stockMetrics(stock, SNAPSHOT_AT), [stock]);
  const realized = useMemo(() => realizedMetrics(allSales, (s) => daysToSale(state, s)), [allSales, state]);
  const monthly = useMemo(() => monthlyProfit(allSales), [allSales]);
  const periodLabel = `${formatDate(`${from}-01T00:00:00+05:30`)} to ${from === to ? formatDate(new Date(Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5)), 0, 12)).toISOString()) : formatDate(new Date(Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5)), 0, 12)).toISOString())}`;
  const partial = demoState === "partial";
  const noSales = realized.count === 0;

  const ledgerRows = useMemo(() => {
    const completed = allSales.filter(isRealized).sort((a, b) => b.closedAt.localeCompare(a.closedAt));
    const excluded = allSales.filter((s) => !isRealized(s));
    return { completed, excluded };
  }, [allSales]);

  const populationRows = (): { title: string; rows: { id: string; label: string; value: string; sub: string }[] } => {
    if (population === "realized") return { title: "Completed, reconciled sales", rows: allSales.filter(isRealized).map((s) => ({ id: s.id, label: s.label, value: formatLakh2(realizedProfit(s)), sub: `${formatDate(s.closedAt)} / realized profit` })) };
    const unsold = stock.filter((v) => v.status !== "sold" && v.status !== "archived");
    if (population === "available") return { title: "Available, cost-complete, priced stock", rows: unsold.filter((v) => v.status === "available" && v.costComplete && v.asking !== null).map((v) => ({ id: v.id, label: `${v.make} ${v.model}`, value: formatLakh2((v.asking ?? 0) - landedCost(v.costs)), sub: "Estimated gross at asking" })) };
    if (population && population.startsWith("age:")) { const key = population.slice(4); return { title: `Unsold stock aged ${key} days`, rows: unsold.filter((v) => (key === ">45" ? stockAgeDays(v, SNAPSHOT_AT) > 45 : AGE_BUCKETS.find((b) => b.key === key && stockAgeDays(v, SNAPSHOT_AT) >= b.min && stockAgeDays(v, SNAPSHOT_AT) <= b.max))).map((v) => ({ id: v.id, label: `${v.make} ${v.model}`, value: formatMoney(landedCost(v.costs)), sub: `${v.status} / ${stockAgeDays(v, SNAPSHOT_AT)}d / landed` })) }; }
    return { title: "All unsold stock (available, reserved and in preparation)", rows: unsold.map((v) => ({ id: v.id, label: `${v.make} ${v.model}`, value: formatMoney(landedCost(v.costs)), sub: `${v.status === "preparation" ? "In preparation" : v.status} / ${stockAgeDays(v, SNAPSHOT_AT)}d` })) };
  };

  const exportLedger = (kind: "csv" | "pdf", provisional: boolean) => {
    const label = provisional || partial ? "PROVISIONAL" : "CERTIFIED";
    const rows = [["record", "state", "sale_or_ask_rupees", "landed_rupees", "gross_rupees", "direct_costs_rupees", "realized_profit_rupees", "cost_completeness"],
      ...allSales.map((s) => [s.id, s.state, String(s.salePrice / 100), String(s.landed / 100), String(saleGross(s) / 100), String(s.directCosts / 100), isRealized(s) ? String(realizedProfit(s) / 100) : "", "Complete"])];
    const header = [`# ${label} / snapshot ${REPORT_SNAPSHOT_ID} / stock as of ${formatDate(SNAPSHOT_AT)} / realized ${periodLabel} / scope ${scope.label}`, "# Units: rupees. Realized profit excludes tax and allocated overhead. Cost-incomplete records are excluded from definitive totals.", `# Excluded from realized: ${realized.excluded} (void or unreconciled)`];
    if (kind === "csv") downloadCsv(`capital-${label.toLowerCase()}.csv`, rows, header);
    else downloadBlob(`capital-${label.toLowerCase()}.pdf`, makePdf(`Capital and profit intelligence (${label})`, [...header.map((h) => h.replace("# ", "")), "", `Stock landed capital: ${formatMoney(metrics.landedCapital)} (as of ${formatDate(SNAPSHOT_AT)})`, `Estimated gross at asking: ${formatMoney(metrics.estimatedGross)} (estimate, not realized)`, `Realized profit: ${formatMoney(realized.profit)} (${realized.count} completed reconciled sales)`, `Median days to sale: ${realized.medianDaysToSale ?? "-"}`]));
    toast(`${label} export ready. Values carry units, cost-completeness and filters.`);
  };

  const pop = population ? populationRows() : null;
  const stockLabel = `Stock as of ${formatDate(SNAPSHOT_AT)}`;

  return (
    <div className="page">
      <PageHead title="Capital and profit intelligence" lead={<button type="button" className="link-btn" style={{ color: "var(--muted)" }} onClick={() => setScopeOpen(true)} aria-label={`Change scope: ${stockLabel}, realized period ${periodLabel}`}>{stockLabel} / realized period {periodLabel}</button>}
        actions={<>
          <Button onClick={() => setDefsOpen(true)}>Definitions</Button>
          <Button variant="primary" className="primary-cta" onClick={() => setExportOpen(true)} disabled={!can("reports.export")} reason={!can("reports.export") ? "Export needs Owner, Manager or Finance access." : undefined}>Export</Button>
        </>} />
      {partial ? <Notice tone="warn" role="status"><Badge tone="warn">Partial</Badge> A panel failed to load: totals are marked Incomplete and never shown as zero. Certified export is blocked; a provisional export is labelled.</Notice> : null}

      <Panel title="Key figures" rows={2} partialFail>
        <div className="kpi-grid">
          <Kpi label="Stock landed capital" value={formatMoney(metrics.landedCapital)} note="As-of stock snapshot" onClick={() => setPopulation("stock")} info={<InfoTip label="About landed capital">Acquisition + transport + inspection + refurbishment + purchase fees, for all unsold stock: available, reserved and in preparation.</InfoTip>} />
          <Kpi label="Est. gross at asking" value={formatMoney(metrics.estimatedGross)} note="Estimate / not realized" onClick={() => setPopulation("available")} info={<InfoTip label="About estimated gross">Asking minus landed cost for available, cost-complete, priced vehicles. An estimate: it never enters realized profit.</InfoTip>} />
          <Kpi label="Realized profit" value={noSales ? MISSING : formatMoney(realized.profit)} note={noSales ? "No realized results yet" : "Completed / reconciled sales"} onClick={() => setPopulation("realized")} info={<InfoTip label="About realized profit">Completed, non-void, reconciled sale proceeds minus landed and posted direct selling/holding costs. Excludes tax and allocated overhead.</InfoTip>} />
          <Kpi label="Median days to sale" value={realized.medianDaysToSale === null ? MISSING : `${realized.medianDaysToSale} days`} note={realized.medianDaysToSale === null ? "No average invented" : "Completed-sale cohort"} tone="accent" onClick={() => setPopulation("realized")} />
        </div>
      </Panel>

      {metrics.grossExcluded ? <p className="meta">{metrics.grossExcluded} available record{metrics.grossExcluded === 1 ? " is" : "s are"} excluded from estimated gross: cost evidence is incomplete and labelled separately.</p> : null}

      <div className="capital-charts">
        <section className="card" aria-labelledby="cb-age"><h2 className="h3" id="cb-age">Stock capital by age / ₹L</h2><p className="meta">Population: unsold stock as of {formatDate(SNAPSHOT_AT)}</p>
          <Panel title="Capital by age" rows={4}>
            <div className="mt-4"><HBars max={Math.max(...Object.values(metrics.capitalByAge), 1) * 1.15} data={AGE_BUCKETS.map((b) => ({ label: b.label.replace(" days", "d"), value: metrics.capitalByAge[b.key], display: formatLakhPlain(metrics.capitalByAge[b.key], 2), exact: formatExact(metrics.capitalByAge[b.key]), tone: b.key === ">45" ? "warn" : "accent", onSelect: () => setPopulation(`age:${b.key}`), ariaLabel: `${b.label}: ${formatExact(metrics.capitalByAge[b.key])} landed capital. Open filtered stock.` }))} /></div>
          </Panel>
        </section>
        <section className="card" aria-labelledby="cb-profit"><h2 className="h3" id="cb-profit">Realized profit by close month / ₹L</h2><p className="meta">Population: completed, reconciled sales closed in the selected period. Sales revenue is never plotted on this axis.</p>
          <Panel title="Realized profit" rows={4}>
            {noSales ? <EmptyState title="No realized results yet">No posted sales in this period. Stock-only panels still show estimated gross. No average days-to-sale is invented.</EmptyState> : (
              <SimpleBars title="Realized profit" unit="₹L" data={monthly.filter((m) => m.month >= from && m.month <= to).map((m) => ({ label: monthName(m.month), value: m.profit / lakh(1) }))} format={(v) => (Math.abs(v) < 1 && v !== 0 ? v.toFixed(2) : String(Math.round(v * 10) / 10))} height={232} onSelect={() => setPopulation("realized")} />
            )}
          </Panel>
        </section>
      </div>

      <section aria-labelledby="ledger-h" className="stack">
        <h2 className="h2" id="ledger-h">Vehicle ledger</h2>
        <Panel title="Vehicle ledger" rows={5} partialFail>
          <div className="table-wrap">
            <table className="data-table" aria-label="Vehicle ledger"><thead><tr><th style={{ width: 220 }}>Sale / vehicle</th><th style={{ width: 130 }}>State</th><th className="num" style={{ width: 160 }}>Sale or ask</th><th className="num" style={{ width: 160 }}>Landed</th><th className="num" style={{ width: 160 }}>Gross</th><th className="num" style={{ width: 160 }}>Direct costs</th><th className="num" style={{ width: 170 }}>Realized profit</th><th style={{ width: 56 }}><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {ledgerRows.completed.slice(0, showAll ? 200 : 10).map((s) => <LedgerSale key={s.id} sale={s} onScenario={() => setScenarioFor("new")} onCorrect={() => setCorrection(s)} canCorrect={can("capital.correct")} />)}
                {showAll ? ledgerRows.excluded.map((s) => <LedgerSale key={s.id} sale={s} excluded onScenario={() => undefined} onCorrect={() => setCorrection(s)} canCorrect={can("capital.correct")} />) : null}
              </tbody>
            </table>
          </div>
          <div className="spread" style={{ flexWrap: "wrap" }}><button className="link-btn" onClick={() => setShowAll((v) => !v)}>{showAll ? "Show fewer rows" : `Show all ${ledgerRows.completed.length + ledgerRows.excluded.length} ledger rows`}</button><Button size="sm" onClick={() => setScenarioFor("new")} disabled={!can("capital.scenario")}>Open scenario calculator</Button></div>
        </Panel>
      </section>
      <p className="footnote">Realized profit excludes tax and allocated overhead under this design basis. Cost-incomplete records are separately labelled and excluded from definitive totals.</p>

      <Drawer open={Boolean(pop)} onClose={() => setPopulation(null)} size="w560" title={pop?.title ?? ""} description={`${pop?.rows.length ?? 0} underlying records. The list reconciles with the figure you opened.`} footer={<Button variant="primary" onClick={() => setPopulation(null)}>Close</Button>}>
        <div className="table-wrap fit"><table className="data-table dense"><thead><tr><th>Record</th><th className="num">Amount</th></tr></thead><tbody>{pop?.rows.map((r) => <tr key={r.id}><td><span className="row-title">{r.id} / {r.label}</span><span className="sub">{r.sub}</span></td><td className="num">{r.value}</td></tr>)}</tbody></table></div>
      </Drawer>
      <ScopeDialog open={scopeOpen} onClose={() => setScopeOpen(false)} from={from} to={to} cost={completeness} onApply={(f, t, c) => { url.set({ from: f === getMonths()[0] ? null : f, to: t === getMonths()[getMonths().length - 1] ? null : t, cost: c === "all" ? null : c }); setScopeOpen(false); }} />
      <Definitions open={defsOpen} onClose={() => { setDefsOpen(false); if (url.get("definition")) url.set({ definition: null }); }} />
      <Scenario open={scenarioFor !== null} onClose={() => setScenarioFor(null)} stock={stock.filter((v) => v.status === "available")} />
      <Correction sale={correction} onClose={() => setCorrection(null)} onSave={(reason, evidence) => { const r = run((s, a) => proposeCorrection(s, a, correction!.id, reason, evidence)); if (!r.ok) return r.fields ?? { form: r.message }; toast("Correction proposed as reversal + new entry. The ledger is unchanged until finance posts it."); setCorrection(null); return null; }} />
      <Dialog open={exportOpen} onClose={() => setExportOpen(false)} title="Export ledger" description="Values, units, cost-completeness and filters are included. Definitions list formulas and excluded records." footer={<><Button onClick={() => setExportOpen(false)}>Cancel</Button><Button onClick={() => { exportLedger("csv", partial); setExportOpen(false); }}>CSV records</Button><Button variant="primary" onClick={() => { exportLedger("pdf", partial); setExportOpen(false); }}>PDF summary</Button></>}>
        {partial ? <Notice tone="warn">Ledger reconciliation is incomplete, so certified results are blocked. Exports are labelled PROVISIONAL.</Notice> : <Notice tone="accent">Reconciled. Exports are labelled CERTIFIED with snapshot {REPORT_SNAPSHOT_ID}.</Notice>}
      </Dialog>
    </div>
  );
}

function LedgerSale({ sale, excluded, onScenario, onCorrect, canCorrect }: { sale: Sale; excluded?: boolean; onScenario: () => void; onCorrect: () => void; canCorrect: boolean }) {
  return (
    <tr>
      <td style={{ height: 80 }}><span className="row-title">{sale.id} / {sale.label}</span><span className="sub">{sale.note ?? "Closed sale"}</span></td>
      <td>{sale.state === "Completed" ? "Completed" : sale.state}</td>
      <td className="num">{formatMoney(sale.salePrice)}</td><td className="num">{formatMoney(sale.landed)}</td><td className="num">{formatLakh2(saleGross(sale))}</td><td className="num">{formatLakh2(sale.directCosts)}</td>
      <td className="num">{excluded ? <span className="warn-text" title={saleStateNote(sale)}>Excluded</span> : formatLakh2(realizedProfit(sale))}</td>
      <td><Menu label={`Actions for ${sale.id}`}>{(close) => <><button role="menuitem" onClick={() => { onScenario(); close(); }}>Open scenario</button>{canCorrect ? <button role="menuitem" onClick={() => { onCorrect(); close(); }}>Propose correction</button> : <span className="menu-label">Corrections need Finance access.</span>}</>}</Menu></td>
    </tr>
  );
}

function ScopeDialog({ open, onClose, from, to, cost, onApply }: { open: boolean; onClose: () => void; from: string; to: string; cost: string; onApply: (from: string, to: string, cost: string) => void }) {
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const [c, setC] = useState(cost);
  useEffect(() => { if (open) { setF(from); setT(to); setC(cost); } }, [open, from, to, cost]);
  const invalid = f > t;
  return (
    <Dialog open={open} onClose={onClose} title="Scope" description="Realized panels use the sale-close period. Stock panels use the as-of date. They measure different populations." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={invalid} onClick={() => onApply(f, t, c)}>Apply</Button></>}>
      <div className="form-grid"><SelectField label="Sale-close from" value={f} onChange={(e) => setF(e.target.value)} options={getMonths().map((m) => ({ value: m, label: monthLabel(m) }))} /><SelectField label="Sale-close to" value={t} onChange={(e) => setT(e.target.value)} options={getMonths().map((m) => ({ value: m, label: monthLabel(m) }))} error={invalid ? "The end month cannot be before the start month." : undefined} /></div>
      <TextField label="Stock as-of date" value={formatDate(SNAPSHOT_AT)} readOnly help="Stock is measured as of now." />
      <SelectField label="Cost completeness" value={c} onChange={(e) => setC(e.target.value)} options={[{ value: "all", label: "All records" }, { value: "complete", label: "Cost-complete only" }, { value: "incomplete", label: "Cost-incomplete only" }]} />
    </Dialog>
  );
}

function Definitions({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rows: [string, string][] = [
    ["Asking price", "Current published seller/dealer request. Not a sale price."],
    ["Landed cost", "Acquisition + transport + inspection + refurbishment + purchase fees. Holding and selling costs are separate."],
    ["Estimated gross at asking", "Asking price minus landed cost for available, cost-complete, priced vehicles. Excluded: cost-incomplete and unpriced records."],
    ["Gross", "Sale price minus landed cost for a posted sale."],
    ["Realized profit", "Completed, non-void, reconciled sale proceeds minus landed and posted direct selling/holding costs. Excludes tax and allocated overhead; estimates never enter it."],
    ["Median days to sale", "Median of acquisition-to-sale-close days over the completed, reconciled sale cohort."],
  ];
  return (
    <Drawer open={open} onClose={onClose} size="w560" title="Definitions" description="Formulas, populations and excluded records. All amounts are integer paise in INR; no currency aggregation when currencies differ." footer={<Button variant="primary" onClick={onClose}>Close</Button>}>
      <dl className="stack">{rows.map(([k, v]) => <div key={k}><dt className="h3">{k}</dt><dd style={{ margin: "4px 0 0" }} className="muted">{v}</dd></div>)}</dl>
    </Drawer>
  );
}

function Scenario({ open, onClose, start, stock }: { open: boolean; onClose: () => void; start?: Vehicle; stock: Vehicle[] }) {
  const [vehicleId, setVehicleId] = useState("");
  const [ask, setAsk] = useState("");
  const [landedL, setLanded] = useState("");
  const [direct, setDirect] = useState("0.20");
  useEffect(() => {
    if (!open) return;
    const v = start ?? stock[0];
    setVehicleId(v?.id ?? "");
    setAsk(v?.asking ? String(v.asking / lakh(1)) : "");
    setLanded(v ? String(landedCost(v.costs) / lakh(1)) : "");
    setDirect("0.20");
  }, [open, start, stock]);
  const askPaise = parseLakhInput(ask) ?? 0;
  const landedPaise = parseLakhInput(landedL) ?? 0;
  const totals = scenarioTotals({ offer: landedPaise, transport: 0, inspection: 0, refurbishment: 0, fees: 0, holdingSelling: parseLakhInput(direct) ?? 0, targetResale: askPaise });
  return (
    <Dialog open={open} onClose={onClose} title="Scenario calculator" description="Hypothetical asking and cost inputs in an isolated calculator. Saving a scenario never alters the ledger or posted totals." footer={<Button variant="primary" onClick={onClose}>Close</Button>}>
      <SelectField label="Vehicle" value={vehicleId} onChange={(e) => { const v = stock.find((x) => x.id === e.target.value); setVehicleId(e.target.value); if (v) { setAsk(String((v.asking ?? 0) / lakh(1))); setLanded(String(landedCost(v.costs) / lakh(1))); } }} options={stock.map((v) => ({ value: v.id, label: `${v.id} / ${v.make} ${v.model}` }))} />
      <div className="form-grid"><TextField label="Hypothetical asking (₹ L)" inputMode="decimal" value={ask} onChange={(e) => setAsk(e.target.value)} /><TextField label="Landed cost (₹ L)" inputMode="decimal" value={landedL} onChange={(e) => setLanded(e.target.value)} /><TextField label="Holding and selling (₹ L)" inputMode="decimal" value={direct} onChange={(e) => setDirect(e.target.value)} /></div>
      <dl className="kv"><div><dt>Scenario gross</dt><dd className="tone-accent">{formatLakh2(totals.gross)}</dd></div><div><dt>Scenario contribution</dt><dd>{formatLakh2(totals.contribution)}</dd></div></dl>
      <p className="meta">Labelled Scenario gross: hypothetical, not posted. {vehicleId}</p>
    </Dialog>
  );
}

function Correction({ sale, onClose, onSave }: { sale: Sale | null; onClose: () => void; onSave: (reason: string, evidence: string) => Record<string, string> | null }) {
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { setReason(""); setEvidence(""); setErrors({}); }, [sale]);
  if (!sale) return null;
  return (
    <Dialog open onClose={onClose} dirty={Boolean(reason || evidence)} title={`Propose correction for ${sale.id}`} description="Posted corrections use a reversal plus a new entry, not a silent overwrite." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => setErrors(onSave(reason, evidence) ?? {})}>Propose correction</Button></>}>
      <TextArea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} data-autofocus />
      <TextField label="Evidence reference" required value={evidence} onChange={(e) => setEvidence(e.target.value)} error={errors.evidence} help="Invoice number, settlement reference or document ID." />
    </Dialog>
  );
}
