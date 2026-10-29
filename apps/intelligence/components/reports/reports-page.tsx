"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { metricsFor } from "@/lib/actions";
import { downloadBlob, makePdf, toCsv } from "@/lib/export";
import { AGE_BUCKETS, realizedProfit, isRealized, stockMetrics } from "@/lib/finance";

import { formatDate, formatDateTime, formatMoney, formatRupees, MISSING, monthKey, monthLabel, monthName, lakh } from "@/lib/format";
import { REPORT_FORMULA, funnelFor, inScope } from "@/lib/selectors";
import { getMonths, REPORT_SNAPSHOT_ID, SNAPSHOT_AT } from "@/lib/time";
import { GroupedBars, HBars, SimpleBars } from "../charts";
import { Dialog, Drawer, Menu } from "../overlay";
import { Gate, Panel } from "../panel";
import { useToast } from "../toast";
import { Badge, Button, Check, EmptyState, ErrorPanel, Kpi, Notice, PageHead, PanelSkeleton, SelectField, Tabs, TextField } from "../ui";
import { useUrlState, useWorkspace } from "../workspace";
import { useRemote } from "../use-remote";
import type { Sale } from "@/lib/domain";
import type { StockMetrics } from "@/lib/finance";

type ReportData = { rows: { month: string; acquired: number; sold: number; profit: number }[]; funnel: { stage: string; count: number }[]; metrics: StockMetrics; prior: { acquired: number; sold: number } | null };
const ZERO_AGE = { "0-15": 0, "16-30": 0, "31-45": 0, ">45": 0 };
const ZERO_METRICS: StockMetrics = { unsold: 0, available: 0, reserved: 0, preparation: 0, landedCapital: 0, ageing: 0, estimatedGross: 0, grossExcluded: 0, availableByAge: ZERO_AGE, capitalByAge: ZERO_AGE };

type TabKey = "overview" | "inventory" | "leads" | "marketing" | "finance";
type Drill = null | "acquired" | "sold" | "profit" | "qualified";

export function ReportsPage() {
  return <Gate capability="reports.view" title="Reports are restricted"><Reports /></Gate>;
}

function Reports() {
  const { state, scope, can, demoState, session } = useWorkspace();
  const url = useUrlState();
  const toast = useToast();
  const tabParam = url.get("tab", "overview") as TabKey;
  const tab: TabKey = (["overview", "inventory", "leads", "marketing", "finance"] as const).includes(tabParam) ? tabParam : "overview";
  const financeAllowed = can("reports.finance");
  const from = url.get("from", getMonths()[0]);
  const to = url.get("to", getMonths()[getMonths().length - 1]);
  const compare = url.get("compare", "previous");
  const [draft, setDraft] = useState({ from, to, compare });
  useEffect(() => setDraft({ from, to, compare }), [from, to, compare]);
  const [drill, setDrill] = useState<Drill>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [chartIndex, setChartIndex] = useState(0);

  const months = getMonths().filter((m) => m >= from && m <= to);
  // One aggregate for the period, computed in the database for the permitted branches.
  const remote = useRemote<ReportData>(`/api/reports?from=${from}&to=${to}&compare=${compare}&branches=${scope.ids.join(",")}`);
  const rows = remote.data?.rows ?? months.map((month) => ({ month, acquired: 0, sold: 0, profit: 0 }));
  const totals = { acquired: rows.reduce((a, r) => a + r.acquired, 0), sold: rows.reduce((a, r) => a + r.sold, 0), profit: rows.reduce((a, r) => a + r.profit, 0) };
  const funnel = remote.data?.funnel ?? ["Enquiries", "Qualified", "Appointments", "Attended", "Sales linked"].map((stage) => ({ stage, count: 0 }));
  const qualified = funnel[1].count;
  const metrics = remote.data?.metrics ?? ZERO_METRICS;
  const incomplete = demoState === "partial";
  const prior = remote.data?.prior ?? null;
  const drillRemote = useRemote<{ rows: Record<string, unknown>[]; total: number }>(drill ? `/api/reports/drill?kind=${drill}&from=${from}&to=${to}&branches=${scope.ids.join(",")}` : null);

  const apply = () => {
    if (draft.from > draft.to) { toast("The end month cannot be before the start month.", "error"); return; }
    url.set({ from: draft.from === getMonths()[0] ? null : draft.from, to: draft.to === getMonths()[getMonths().length - 1] ? null : draft.to, compare: draft.compare === "previous" ? null : draft.compare });
  };
  const periodLabel = `${formatDate(`${from}-01T00:00:00+05:30`)} to ${formatDate(new Date(Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5)), 0, 12)).toISOString())}`;
  const dirtyFilters = draft.from !== from || draft.to !== to || draft.compare !== compare;
  const noRecords = Boolean(remote.data) && totals.acquired === 0 && totals.sold === 0;

  const track = (name: string) => { void fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, branch: scope.value, properties: { tab } }) }).catch(() => undefined); };
  useEffect(() => { track("report_viewed"); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const drillRows = () => {
    const rowsIn = drillRemote.data?.rows ?? [];
    const shown = `Showing ${rowsIn.length} of ${drillRemote.data?.total ?? 0}.`;
    if (drill === "acquired") return { title: "Acquired stock / inventory event cohort", rows: rowsIn.map((e) => [String(e.ref), String(e.label), formatDate(String(e.at))]), head: ["Record", "Vehicle", "Date"], note: shown };
    if (drill === "sold") return { title: "Completed sales / sale-close cohort", rows: (rowsIn as unknown as Sale[]).map((s) => [s.id, s.label, formatDate(s.closedAt)]), head: ["Record", "Vehicle", "Closed"], note: shown };
    if (drill === "profit") return { title: "Realized profit / reconciled sales", rows: (rowsIn as unknown as Sale[]).map((s) => [s.id, s.label, formatMoney(realizedProfit(s), { dp: 2 })]), head: ["Record", "Vehicle", "Realized profit"], note: shown };
    return { title: "Qualified leads / lead-created cohort", rows: rowsIn.map((l) => [String(l.ref), String(l.label), String(l.stage)]), head: ["Record", "Lead", "Stage"], note: `Leads created in the selected period that currently sit at Qualified or beyond. ${shown}` };
  };
  const dr = drill ? drillRows() : null;

  const mobileCharts = [
    { title: "Inventory events / vehicle counts", node: <GroupedBars title="Inventory events" unit="vehicles" data={rows.map((r) => ({ label: monthName(r.month), values: [r.acquired, r.sold] }))} series={[{ name: "Acquired", color: "var(--accent)" }, { name: "Sold", color: "var(--info)" }]} onSelect={(_, s) => setDrill(s === 0 ? "acquired" : "sold")} /> },
    { title: "Realized profit / ₹L", node: <SimpleBars title="Realized profit" unit="₹L" data={rows.map((r) => ({ label: monthName(r.month), value: r.profit / lakh(1) }))} format={(v) => (Math.abs(v) < 1 && v !== 0 ? v.toFixed(2) : String(Math.round(v * 10) / 10))} onSelect={() => setDrill("profit")} /> },
    { title: "Unique lead cohort funnel", node: <Funnel data={funnel} /> },
  ];

  return (
    <div className="page">
      <PageHead title="Reports and analytics" lead="Reproducible snapshots with reconciled definitions." actions={<><Menu label="Saved views" buttonClass="btn" text="Saved views" align="right">{(close) => <><button role="menuitem" onClick={() => { setViewsOpen(true); close(); }}>Manage saved views</button></>}</Menu><Button variant="primary" className="primary-cta" onClick={() => setExportOpen(true)} disabled={!can("reports.export")} reason={!can("reports.export") ? "Export needs Owner, Manager, Marketing or Finance access." : undefined}>Export</Button></>} />
      <Tabs label="Report" value={tab} onChange={(v) => { url.set({ tab: v === "overview" ? null : v }); if (v === "finance" && !financeAllowed) toast("Finance reports need Owner or Finance access.", "error"); }} idPrefix="rp" tabs={[{ value: "overview", label: "Overview" }, { value: "inventory", label: "Inventory" }, { value: "leads", label: "Leads" }, { value: "marketing", label: "Marketing" }, { value: "finance", label: "Finance" }]} />

      <form className="report-filters" onSubmit={(e) => { e.preventDefault(); apply(); }} role="group" aria-label="Report filters">
        <div className="period-pair" role="group" aria-label="Period">
          <SelectField label="Period from" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} options={getMonths().map((m) => ({ value: m, label: monthLabel(m) }))} />
          <SelectField label="Period to" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} options={getMonths().map((m) => ({ value: m, label: monthLabel(m) }))} error={draft.from > draft.to ? "End month is before the start." : undefined} />
        </div>
        <SelectField label="Comparison" value={draft.compare} onChange={(e) => setDraft({ ...draft, compare: e.target.value })} options={[{ value: "previous", label: "Comparison: previous period" }, { value: "yoy", label: "Comparison: same period last year" }, { value: "none", label: "No comparison" }]} />
        <TextField label="Branch" value={scope.label} readOnly help="Set in the header" />
        <Button variant="primary" type="submit">Apply</Button>
        <Button onClick={() => setScheduleOpen(true)} disabled={!can("reports.schedule")} reason={!can("reports.schedule") ? "Scheduling needs Owner, Manager or Finance access." : undefined}>Schedule</Button>
      </form>
      <p className="meta">Period {periodLabel} / one applied scope across all panels. {dirtyFilters ? <Badge tone="warn">Changes not applied</Badge> : null}</p>
      <p className="meta">Dates used: acquired stock by acquisition date, sales by sale-close date, leads by the date the lead was created. Stock age and landed capital are as of today, whatever the period. Records dated before {monthLabel(getMonths()[0])} fall outside every selectable period.</p>

      {tab === "finance" && !financeAllowed ? (
        <div className="state-box" role="alert"><h2 className="h3">Finance reports are restricted</h2><p className="muted">Requires Owner or Finance access. Nothing about the underlying ledger is shown here.</p></div>
      ) : !remote.data ? (
        remote.status === "error" ? <ErrorPanel title="The report could not load" onRetry={remote.reload} /> : <PanelSkeleton rows={6} title="Report" />
      ) : noRecords ? (
        <EmptyState title="No records in this range">The query succeeded, so counts of zero are real. Ratios and medians display an em dash ({MISSING}) rather than zero. Scope: {scope.label}, {periodLabel}.</EmptyState>
      ) : (
        <>
          <Panel title="Key figures" rows={2} partialFail>
            <div className="kpi-grid">
              <Kpi label="Acquired stock" value={totals.acquired} note="Inventory event cohort" onClick={() => setDrill("acquired")} />
              <Kpi label="Completed sales" value={totals.sold} note="Sale-close cohort" onClick={() => setDrill("sold")} />
              <Kpi label="Realized profit" value={formatMoney(totals.profit)} note="Reconciled sales" onClick={() => setDrill("profit")} />
              <Kpi label="Qualified leads" value={qualified} note="Lead-created cohort" onClick={() => setDrill("qualified")} />
            </div>
          </Panel>
          {compare !== "none" ? <p className="meta">{prior ? `Previous equal-length period: ${prior.acquired} acquired, ${prior.sold} completed sales.` : compare === "yoy" ? "Same period last year: unavailable. No data is held before January 2026." : "Previous period: unavailable. No data is held before January 2026."}</p> : null}

          {tab === "overview" || tab === "inventory" ? (
            <div className="report-charts only-desktop">
              <section className="card" aria-labelledby="rc1"><h2 className="h3" id="rc1">Inventory events / vehicle counts</h2><Panel title="Inventory events" rows={5} partialFail><div className="mt-4">{mobileCharts[0].node}</div></Panel></section>
              <section className="card" aria-labelledby="rc2"><h2 className="h3" id="rc2">Unique lead cohort funnel</h2><p className="meta">Event-entry counts for the selected cohort. Percentages name their denominator: the previous stage.</p><Panel title="Lead funnel" rows={5} partialFail><div className="mt-4"><Funnel data={funnel} /></div></Panel></section>
            </div>
          ) : null}
          {tab === "finance" ? (
            <div className="report-charts only-desktop">
              <section className="card"><h2 className="h3">Realized profit series / ₹L</h2><div className="mt-4"><SimpleBars title="Realized profit" unit="₹L" data={rows.map((r) => ({ label: monthName(r.month), value: r.profit / lakh(1) }))} format={(v) => (Math.abs(v) < 1 && v !== 0 ? v.toFixed(2) : String(Math.round(v * 10) / 10))} onSelect={() => setDrill("profit")} /></div></section>
              <section className="card"><h2 className="h3">Financial definitions</h2><dl className="kv mt-2"><div><dt>Realized profit</dt><dd style={{ maxWidth: 300 }}>Completed, non-void, reconciled sale proceeds minus landed and posted direct costs. Excludes tax and allocated overhead.</dd></div><div><dt>Unrealized estimates</dt><dd style={{ maxWidth: 300 }}>Never included.</dd></div><div><dt>Stock landed capital</dt><dd>{formatMoney(metrics.landedCapital)}</dd></div></dl></section>
            </div>
          ) : null}
          {tab === "leads" ? <section className="card only-desktop"><h2 className="h3">Unique lead cohort funnel</h2><div className="mt-4"><Funnel data={funnel} /></div></section> : null}
          {tab === "marketing" ? <Marketing /> : null}
          {tab === "inventory" ? <section className="card only-desktop"><h2 className="h3">Stock age distribution (available)</h2><div className="mt-4"><HBars data={AGE_BUCKETS.map((b) => ({ label: b.label.replace(" days", "d"), value: metrics.availableByAge[b.key], display: String(metrics.availableByAge[b.key]), tone: b.key === ">45" ? "warn" : "accent" }))} /></div></section> : null}

          <section className="card only-mobile" aria-label="Charts">
            <div className="seg" role="group" aria-label="Chart" style={{ flexWrap: "wrap" }}>{mobileCharts.map((c, i) => <Button key={c.title} size="sm" variant={chartIndex === i ? "primary" : "secondary"} aria-pressed={chartIndex === i} onClick={() => setChartIndex(i)}>{c.title.split(" / ")[0]}</Button>)}</div>
            <h2 className="h3 mt-4">{mobileCharts[chartIndex].title}</h2><div className="mt-4">{mobileCharts[chartIndex].node}</div>
          </section>

          <Panel title="Underlying records" rows={4} partialFail>
            <div className="table-wrap only-desktop">
              <table className="data-table" aria-label="Underlying records"><thead><tr><th style={{ width: 230 }}>Month</th><th className="num" style={{ width: 186 }}>Acquired</th><th className="num" style={{ width: 186 }}>Completed sales</th><th className="num" style={{ width: 186 }}>Realized profit</th><th style={{ width: 186 }}>Snapshot</th><th style={{ width: 186 }}>Cost basis</th></tr></thead>
                <tbody>{rows.map((r) => <tr key={r.month}><td><span className="row-title">{monthLabel(r.month)}</span></td><td className="num">{r.acquired}</td><td className="num">{r.sold}</td><td className="num">{formatMoney(r.profit)}</td><td>{REPORT_SNAPSHOT_ID}</td><td>Complete</td></tr>)}</tbody></table>
            </div>
            <ul className="card-list only-mobile" aria-label="Months">{rows.map((r) => <li key={r.month} className="card tight listing-card"><strong>{monthLabel(r.month)}</strong><span className="meta">{r.acquired} acquired / {r.sold} sales / {formatMoney(r.profit)} realized</span><span className="meta">{REPORT_SNAPSHOT_ID} / Complete</span></li>)}</ul>
          </Panel>
        </>
      )}
      {incomplete ? <Notice tone="warn" role="status"><Badge tone="warn">Incomplete report</Badge> A panel failed. Exports include a failure notice or are blocked for complete-only mode.</Notice> : null}
      {demoState === "error" ? <ErrorPanel title="Report snapshot failed" message="The previous snapshot stays labelled until a new one is ready. Retry rebuilds it." onRetry={() => url.set({ demo_state: null })} /> : null}
      <p className="meta">Generated {formatDateTime(SNAPSHOT_AT)} / Snapshot {REPORT_SNAPSHOT_ID} / Formula {REPORT_FORMULA} / Record cutoff {formatDate(SNAPSHOT_AT)}. Backfilled data may change newer snapshots; previous exports remain reproducible.</p>

      <Drawer open={Boolean(dr)} onClose={() => setDrill(null)} size="w560" title={dr?.title ?? ""} description={`${dr?.rows.length ?? 0} underlying records / identical cohort and filters / ${periodLabel}`} footer={<Button variant="primary" onClick={() => setDrill(null)}>Close</Button>}>
        {dr && "note" in dr && dr.note ? <Notice tone="warn">{dr.note}</Notice> : null}
        <div className="table-wrap fit"><table className="data-table dense"><caption className="sr-only">{dr?.title}</caption><thead><tr>{dr?.head.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{dr?.rows.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody></table></div>
      </Drawer>
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} rows={rows} totals={totals} qualified={qualified} periodLabel={periodLabel} scopeLabel={scope.label} incomplete={incomplete} onTrack={track} actorName={session.name} />
      <ScheduleDialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} scopeLabel={scope.label} periodLabel={periodLabel} />
      <ViewsDialog open={viewsOpen} onClose={() => setViewsOpen(false)} />
    </div>
  );
}

function Funnel({ data }: { data: { stage: string; count: number }[] }) {
  return (
    <div>
      <HBars max={Math.max(data[0].count, 1)} data={data.map((d) => ({ label: d.stage, value: d.count, display: String(d.count) }))} />
      <p className="meta mt-4">{data.slice(1).map((d, i) => `${d.stage}: ${data[i].count ? Math.round((d.count / data[i].count) * 100) : 0}% of ${data[i].stage.toLowerCase()}`).join(" / ")}</p>
    </div>
  );
}

function Marketing() {
  const { state } = useWorkspace();
  const withMetrics = state.campaigns.filter((c) => c.metrics);
  return (
    <section className="card only-desktop"><h2 className="h3">Campaign performance</h2>
      {withMetrics.length === 0 ? <p className="muted mt-2">Metrics unavailable: no campaign has returned data. Unavailable is not zero.</p> : (
        <div className="table-wrap fit mt-4"><table className="data-table"><thead><tr><th>Campaign</th><th className="num">Spend</th><th className="num">Leads</th><th className="num">Qualified</th><th className="num">CPL</th><th className="num">Cost / qualified</th></tr></thead>
          <tbody>{withMetrics.map((c) => { const m = metricsFor(c)!; return <tr key={c.id}><td><span className="row-title">{c.id}</span><span className="sub">{c.name} / click {c.clickWindowDays}d, view {c.viewWindowDays}d</span></td><td className="num">{formatRupees(m.spend)}</td><td className="num">{m.leads}</td><td className="num">{m.qualified}</td><td className="num">{formatRupees(m.cpl)}</td><td className="num">{formatRupees(m.costPerQualified)}</td></tr>; })}</tbody></table></div>
      )}
      <p className="meta mt-4">No fabricated reach estimate or sale attribution.</p>
    </section>
  );
}

function ExportDialog({ open, onClose, rows, totals, qualified, periodLabel, scopeLabel, incomplete, onTrack, actorName }: { open: boolean; onClose: () => void; rows: { month: string; acquired: number; sold: number; profit: number }[]; totals: { acquired: number; sold: number; profit: number }; qualified: number; periodLabel: string; scopeLabel: string; incomplete: boolean; onTrack: (name: string) => void; actorName: string }) {
  const toast = useToast();
  const [format, setFormat] = useState<"csv" | "pdf">("csv");
  const [fields, setFields] = useState({ acquired: true, sold: true, profit: true, snapshot: true });
  const [basis, setBasis] = useState<"complete" | "provisional">("complete");
  const [status, setStatus] = useState<"idle" | "queued" | "ready" | "cancelled">("idle");
  const [progress, setProgress] = useState(0);
  const timer = useRef<number | null>(null);
  const blobRef = useRef<{ name: string; blob: Blob } | null>(null);
  useEffect(() => { if (open) { setStatus("idle"); setProgress(0); } return () => { if (timer.current) window.clearInterval(timer.current); }; }, [open]);
  const build = () => {
    const label = basis === "provisional" || incomplete ? "PROVISIONAL" : "COMPLETE";
    const head = [`# ${label} / snapshot ${REPORT_SNAPSHOT_ID} / formula ${REPORT_FORMULA} / scope ${scopeLabel} / period ${periodLabel} / generated for ${actorName}`, "# Units: vehicles; rupees. Realized profit excludes tax and allocated overhead."];
    const cols = ["month", ...(fields.acquired ? ["acquired"] : []), ...(fields.sold ? ["completed_sales"] : []), ...(fields.profit ? ["realized_profit_rupees"] : []), ...(fields.snapshot ? ["snapshot"] : [])];
    const body = rows.map((r) => [monthLabel(r.month), ...(fields.acquired ? [String(r.acquired)] : []), ...(fields.sold ? [String(r.sold)] : []), ...(fields.profit ? [String(r.profit / 100)] : []), ...(fields.snapshot ? [REPORT_SNAPSHOT_ID] : [])]);
    if (format === "csv") return { name: `report-${label.toLowerCase()}-${REPORT_SNAPSHOT_ID}.csv`, blob: new Blob([toCsv([cols, ...body], head)], { type: "text/csv;charset=utf-8" }) };
    return { name: `report-${label.toLowerCase()}-${REPORT_SNAPSHOT_ID}.pdf`, blob: makePdf("Reports and analytics", [...head.map((h) => h.replace("# ", "")), "", `Acquired ${totals.acquired} / Completed sales ${totals.sold} / Realized profit ${formatMoney(totals.profit)} / Qualified leads ${qualified}`, "", cols.join(" | "), ...body.map((b) => b.join(" | "))]) };
  };
  const start = () => {
    setStatus("queued"); setProgress(0); onTrack("export_requested");
    blobRef.current = build();
    timer.current = window.setInterval(() => setProgress((p) => { const next = Math.min(100, p + 20); if (next >= 100 && timer.current) { window.clearInterval(timer.current); timer.current = null; setStatus("ready"); onTrack("export_ready"); } return next; }), 350);
  };
  const cancel = () => { if (timer.current) window.clearInterval(timer.current); timer.current = null; setStatus("cancelled"); toast("Export cancelled. Queued work stops where possible."); };
  return (
    <Dialog open={open} onClose={onClose} title="Export report" description="Choose a format, fields and basis. The export captures the applied filters, timezone, snapshot, formula version and access scope." size="w640"
      footer={status === "ready" ? <><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => { if (blobRef.current) downloadBlob(blobRef.current.name, blobRef.current.blob); }}>Download</Button></> : <><Button onClick={onClose}>Close</Button>{status === "queued" ? <Button variant="danger" onClick={cancel}>Cancel export</Button> : <Button variant="primary" onClick={start}>Start export</Button>}</>}>
      <fieldset className="radio-group"><legend className="label">Format</legend>{([["csv", "CSV records"], ["pdf", "PDF summary"]] as const).map(([v, l]) => <label className="check" key={v}><input type="radio" name="fmt" checked={format === v} onChange={() => setFormat(v)} disabled={status === "queued"} /><span>{l}</span></label>)}</fieldset>
      <fieldset className="radio-group"><legend className="label">Fields</legend>{([["acquired", "Acquired stock"], ["sold", "Completed sales"], ["profit", "Realized profit"], ["snapshot", "Snapshot reference"]] as const).map(([k, l]) => <Check key={k} label={l} checked={fields[k]} onChange={(v) => setFields({ ...fields, [k]: v })} disabled={status === "queued"} />)}</fieldset>
      <SelectField label="Basis" value={incomplete ? "provisional" : basis} onChange={(e) => setBasis(e.target.value as typeof basis)} options={[{ value: "complete", label: "Complete only", disabled: incomplete }, { value: "provisional", label: "Provisional (clearly labelled)" }]} disabled={status === "queued"} help={incomplete ? "A failed panel makes complete-only export unavailable." : undefined} />
      {status === "queued" ? <div role="status" aria-live="polite"><p>Preparing export… {progress}%</p><div className="progress"><span style={{ width: `${progress}%` }} /></div></div> : null}
      {status === "ready" ? <Notice tone="accent" role="status">Ready. This authenticated download expires in 15 minutes and stays reproducible from snapshot {REPORT_SNAPSHOT_ID}.</Notice> : null}
    </Dialog>
  );
}

function ScheduleDialog({ open, onClose, scopeLabel, periodLabel }: { open: boolean; onClose: () => void; scopeLabel: string; periodLabel: string }) {
  const { state, run } = useWorkspace();
  const toast = useToast();
  const [report, setReport] = useState("Overview");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [cadence, setCadence] = useState("Weekly");
  const [start, setStart] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (open) { setReport("Overview"); setRecipients([]); setCadence("Weekly"); setStart(""); setErrors({}); } }, [open]);
  const people = state.team.filter((t) => t.status === "Active" && ["owner", "manager", "marketing", "finance"].includes(t.role));
  return (
    <Dialog open={open} onClose={onClose} title="Schedule report" description="Recipients must still hold permission at delivery. Messages carry a link with access checks, not personal data." size="w640" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => {
      const next: Record<string, string> = {};
      if (!recipients.length) next.recipients = "Choose at least one permitted recipient.";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) next.start = "Choose a start date.";
      if (Object.keys(next).length) { setErrors(next); return; }
      run((s) => ({ ok: true as const, state: { ...s, reportSchedules: [...s.reportSchedules, { id: `RS-${s.reportSchedules.length + 1}`, report, recipients, cadence, timezone: "Asia/Kolkata", startDate: start }] } }));
      toast("Schedule saved. Recipient access is checked at each delivery."); onClose();
    }}>Save schedule</Button></>}>
      <div className="form-grid"><SelectField label="Report" value={report} onChange={(e) => setReport(e.target.value)} options={["Overview", "Inventory", "Leads", "Marketing", "Finance"]} /><SelectField label="Cadence" value={cadence} onChange={(e) => setCadence(e.target.value)} options={["Weekly", "Monthly"]} />
        <TextField label="Start date" type="date" value={start} onChange={(e) => setStart(e.target.value)} error={errors.start} /><TextField label="Timezone" value="Asia/Kolkata" readOnly /></div>
      <fieldset className="radio-group"><legend className="label">Recipients (permitted users)</legend>{people.map((p) => <Check key={p.id} label={`${p.name} / ${p.role}`} checked={recipients.includes(p.id)} onChange={(v) => setRecipients((r) => (v ? [...r, p.id] : r.filter((x) => x !== p.id)))} />)}{errors.recipients ? <div className="field-error" role="alert">{errors.recipients}</div> : null}</fieldset>
      <Notice role="status">Included scope: {scopeLabel}, {periodLabel}.</Notice>
      {state.reportSchedules.length ? <p className="meta">{state.reportSchedules.length} schedule(s) saved.</p> : null}
    </Dialog>
  );
}

function ViewsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, run } = useWorkspace();
  const url = useUrlState();
  const toast = useToast();
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <Dialog open={open} onClose={onClose} title="Saved views" description="Save the current filters under a name. Rename, update and delete are explicit." footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="row-flex" style={{ alignItems: "end" }}><TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} /><Button variant="primary" disabled={!name.trim()} onClick={() => { run((s) => ({ ok: true as const, state: { ...s, savedViews: [...s.savedViews, { id: `SV-${s.savedViews.length + 1}`, name: name.trim(), query: window.location.search.replace(/^\?/, "") }] } })); setName(""); toast("View saved."); }}>Save current view</Button></div>
      {state.savedViews.length === 0 ? <p className="muted">No saved views yet.</p> : <ul className="stack-sm" style={{ listStyle: "none", margin: 0, padding: 0 }}>{state.savedViews.map((v) => <li key={v.id} className="card tight spread"><strong>{v.name}</strong><span className="row-flex"><Button size="sm" onClick={() => { onClose(); url.set(Object.fromEntries(new URLSearchParams(v.query).entries())); }}>Apply</Button><Button size="sm" variant="danger" onClick={() => setConfirm(v.id)}>Delete view</Button></span>{confirm === v.id ? <Notice tone="danger" role="alert">Delete “{v.name}”? <Button size="sm" variant="danger" onClick={() => { run((s) => ({ ok: true as const, state: { ...s, savedViews: s.savedViews.filter((x) => x.id !== v.id) } })); setConfirm(null); toast("View deleted."); }}>Delete view</Button> <Button size="sm" onClick={() => setConfirm(null)}>Keep</Button></Notice> : null}</li>)}</ul>}
    </Dialog>
  );
}
