"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AGE_BUCKETS } from "@/lib/finance";
import { ALL_BRANCHES } from "@/lib/fixtures/branches";
import { formatDate, formatDateTime, formatMoney, formatTime, monthLabel, monthName, MISSING } from "@/lib/format";
import { getMonths, SNAPSHOT_AT } from "@/lib/time";
import { HBars, GroupedBars } from "../charts-lazy";
import { Drawer, Menu } from "../overlay";
import { RemotePanel } from "../panel";
import { useRemote } from "../use-remote";
import { Badge, Button, EmptyState, InfoTip, Kpi, PageHead, Tabs, TextField } from "../ui";
import { VehicleDrawer } from "../inventory/vehicle-drawer";
import { defaultBranchOf, useScopedHref, useUrlState, useWorkspace } from "../workspace";
import type { Alert, InventoryEvent, Lead, Vehicle } from "@/lib/domain";
import type { StockMetrics } from "@/lib/finance";

type OverviewData = { metrics: StockMetrics; movement: { month: string; acquired: number; sold: number }[]; hasStock: boolean; alerts: Alert[]; alertTotal: number; records: { vehicles: Vehicle[]; leads: Lead[] } };
const ZERO_AGE = { "0-15": 0, "16-30": 0, "31-45": 0, ">45": 0 };
const ZERO_METRICS: StockMetrics = { unsold: 0, available: 0, reserved: 0, preparation: 0, landedCapital: 0, ageing: 0, estimatedGross: 0, grossExcluded: 0, availableByAge: ZERO_AGE, capitalByAge: ZERO_AGE };

type RangeKey = "today" | "30d" | "mtd" | "custom";
const RANGES: { value: RangeKey; label: string }[] = [{ value: "today", label: "Today" }, { value: "30d", label: "Last 30 days" }, { value: "mtd", label: "Month to date" }, { value: "custom", label: "Custom" }];
type QueueTab = "all" | "pricing" | "leads" | "integrations";

function inRange(alert: Alert, range: RangeKey, from: string, to: string): boolean {
  if (!alert.dueAt) return true;
  const due = new Date(alert.dueAt).getTime();
  const snapshot = new Date(SNAPSHOT_AT).getTime();
  const overdue = due < snapshot;
  if (range === "today") return overdue || formatDate(alert.dueAt) === formatDate(SNAPSHOT_AT);
  if (range === "30d") return due >= snapshot - 30 * 86_400_000;
  if (range === "mtd") { const ist = new Date(snapshot + 330 * 60_000); return due >= Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - 330 * 60_000; }
  const start = from ? new Date(`${from}T00:00:00+05:30`).getTime() : 0;
  const end = to ? new Date(`${to}T23:59:59+05:30`).getTime() : Infinity;
  return due >= start && due <= end;
}

export function OverviewPage() {
  const { state, scope, can, demoState, mergeRecords } = useWorkspace();
  const url = useUrlState();
  const href = useScopedHref();
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [monthDrawer, setMonthDrawer] = useState<{ month: string; type?: "acquired" | "sold" } | null>(null);
  const range = (RANGES.find((r) => r.value === url.get("range"))?.value ?? "30d") as RangeKey;
  const [draftFrom, setDraftFrom] = useState(url.get("from"));
  const [draftTo, setDraftTo] = useState(url.get("to"));
  const [customOpen, setCustomOpen] = useState(false);
  const tab = (["all", "pricing", "leads", "integrations"].includes(url.get("queue")) ? url.get("queue") : "all") as QueueTab;
  // Aggregated in the database for the permitted branches; the browser never receives the stock or lead lists to compute these.
  const remote = useRemote<OverviewData>(`/api/overview?branches=${scope.ids.join(",")}`, (d) => mergeRecords({ vehicles: d.records.vehicles, leads: d.records.leads }));
  const model = { metrics: remote.data?.metrics ?? ZERO_METRICS, movement: remote.data?.movement ?? getMonths().map((month) => ({ month, acquired: 0, sold: 0 })), hasStock: remote.data?.hasStock ?? true };
  const m = model.metrics;
  const alerts = useMemo(() => (remote.data?.alerts ?? []).filter((a) => inRange(a, range, url.get("from"), url.get("to"))), [remote.data, range, url]);
  const filtered = alerts.filter((a) => (tab === "all" ? true : tab === "pricing" ? a.type === "Pricing" : tab === "leads" ? a.type === "Leads" : a.type === "Integration"));
  const rangeLabel = range === "custom" ? `${url.get("from") || "…"} to ${url.get("to") || "…"}` : RANGES.find((r) => r.value === range)!.label;
  const branchParam: Record<string, string> = scope.value === defaultBranchOf(state) ? {} : { branch: scope.value };
  const invHref = (extra: Record<string, string>) => href("/app/inventory", { ...extra, ...branchParam });
  const days = AGE_BUCKETS.map((b) => ({ key: b.key, label: b.label, count: m.availableByAge[b.key] }));
  const eventsRemote = useRemote<{ events: InventoryEvent[] }>(monthDrawer ? `/api/overview/events?month=${monthDrawer.month}${monthDrawer.type ? `&type=${monthDrawer.type}` : ""}&branches=${scope.ids.join(",")}` : null);
  const eventRows = monthDrawer ? eventsRemote.data?.events ?? [] : [];

  const actionFor = (a: Alert): { label: string; to: string } => {
    if (a.recordKind === "vehicle" && a.type === "Pricing") return { label: "Review", to: href("/app/pricing", { vehicle: a.recordRef }) };
    if (a.recordKind === "lead") return { label: "Open lead", to: href(`/app/leads/${a.recordRef}`) };
    if (a.recordKind === "integration" || a.type === "Integration") return { label: "Inspect", to: href("/app/settings/integrations") };
    return { label: "View", to: href("/app/alerts", { alert: a.id }) };
  };
  const recordLabel = (a: Alert) => {
    const v = state.vehicles.find((x) => x.id === a.recordRef);
    if (v) return { title: `${v.id} / ${v.model}`, sub: `${v.year} / ${v.status === "preparation" ? "In preparation" : v.status[0].toUpperCase() + v.status.slice(1)}` };
    const l = state.leads.find((x) => x.id === a.recordRef);
    if (l) return { title: `${l.id} / ${l.name}`, sub: `${l.vehicleId ?? "Unspecified"} / ${l.source}` };
    return { title: a.recordRef, sub: a.type };
  };

  const empty = !model.hasStock && demoState === "empty";

  return (
    <div className="page overview">
      <PageHead title="Dealer Command Centre" lead="Your branch, your stock and today’s priorities."
        actions={<>
          <Menu label={`Date range: ${rangeLabel}`} buttonClass="btn" align="right" text={<><span>{rangeLabel}</span></>}>
            {(close) => (
              <>
                {RANGES.map((r) => <button key={r.value} role="menuitemradio" aria-checked={range === r.value} onClick={() => { if (r.value === "custom") { setCustomOpen(true); close(); } else { url.set({ range: r.value === "30d" ? null : r.value, from: null, to: null }); close(); } }}>{r.label}</button>)}
              </>
            )}
          </Menu>
          {can("inventory.edit") ? <Button variant="primary" className="primary-cta" onClick={() => setAddOpen(true)}>Add vehicle</Button> : <Button variant="primary" disabled reason="Requires Owner, Manager or Inventory access.">Add vehicle</Button>}
        </>} />

      {customOpen ? (
        <div className="card tight row-flex" role="group" aria-label="Custom date range">
          <TextField label="From" type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} />
          <TextField label="To" type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} />
          <Button variant="primary" onClick={() => { url.set({ range: "custom", from: draftFrom, to: draftTo }); setCustomOpen(false); }} disabled={!draftFrom && !draftTo}>Apply</Button>
          <Button onClick={() => setCustomOpen(false)}>Cancel</Button>
        </div>
      ) : null}

      {empty ? (
        <EmptyState title="Set up your workspace" actions={<><Button variant="primary" onClick={() => setAddOpen(true)}>Add first vehicle</Button><Link href={href("/app/inventory", { import: "1" })} className="btn">Import stock</Link><Link href="/onboarding" className="btn btn-ghost">Resume setup</Link></>}>
          No stock or feeds are connected yet. Market estimates are unavailable until a licensed source is connected, so no history is shown. Percentage changes appear once a comparison period exists.
        </EmptyState>
      ) : null}

      <section aria-label="Key figures" className="order-kpi">
        <RemotePanel title="Key figures" remote={remote} rows={2}>
          <div className="kpi-grid">
            <Kpi label="Available stock" value={m.available} note="Available vehicles" href={invHref({ tab: "available" })} />
            <Kpi label="Landed capital" value={formatMoney(m.landedCapital)} note={`Stock as of ${formatDate(SNAPSHOT_AT).slice(0, 6)}`} href={href("/app/capital", branchParam)} />
            <Kpi label="Ageing >45 days" value={m.ageing} note="Needs review" tone="warn" href={invHref({ tab: "available", age: ">45" })} />
            <Kpi label="Est. gross at asking" value={formatMoney(m.estimatedGross)} note="Estimate / not realized" href={href("/app/capital", { ...branchParam, definition: "gross" })}
              info={<InfoTip label="About estimated gross at asking">Asking price minus landed cost for cost-complete, priced, available vehicles. {m.grossExcluded} record(s) excluded for missing cost. Not a realized result.</InfoTip>} />
          </div>
        </RemotePanel>
        <p className="meta mt-2">Key figures are stock as of {formatDate(SNAPSHOT_AT)}. The movement chart covers whole months; the range selector above applies to activity lists only.</p>
      </section>

      <div className="split-60 order-charts" style={{ gridTemplateColumns: "minmax(0, 720fr) minmax(0, 416fr)" }}>
        <section className="card order-movement" aria-labelledby="mv-title">
          <div className="card-head"><h2 className="h3" id="mv-title">Inventory movement</h2><span className="meta">Acquired / Sold · {monthLabel(getMonths()[0])} to {monthLabel(getMonths()[getMonths().length - 1])}</span></div>
          <RemotePanel title="Inventory movement" remote={remote} rows={5}>
            <GroupedBars title="Inventory movement" unit="vehicles" data={model.movement.map((d) => ({ label: monthName(d.month), values: [d.acquired, d.sold], ariaLabel: `${monthLabel(d.month)}: acquired ${d.acquired}, sold ${d.sold}. Open matching inventory events.` }))}
              series={[{ name: "Acquired", color: "var(--accent)" }, { name: "Sold", color: "var(--info)" }]} onSelect={(i, s) => setMonthDrawer({ month: getMonths()[i], type: s === 0 ? "acquired" : "sold" })} />
          </RemotePanel>
        </section>
        <section className="card order-age" aria-labelledby="age-title">
          <div className="card-head"><h2 className="h3" id="age-title">Stock age / {m.available} available</h2></div>
          <RemotePanel title="Stock age" remote={remote} rows={4}>
            <HBars max={Math.max(...days.map((d) => d.count), 1) * 1.15} data={days.map((d) => ({ label: d.label.replace(" days", "d"), value: d.count, display: String(d.count), tone: d.key === ">45" ? "warn" : "accent", onSelect: () => router.push(invHref({ tab: "available", age: d.key })), ariaLabel: `${d.label}: ${d.count} available. Open age-filtered stock.` }))} />
            <p className="meta mt-4">Age buckets sum to available stock ({days.reduce((a, d) => a + d.count, 0)}). Reserved and in-preparation records are in landed capital, not in this count.</p>
          </RemotePanel>
        </section>
      </div>

      <section aria-labelledby="pa-title" className="order-actions stack">
        <div className="section-title"><h2 className="h2" id="pa-title">Priority actions</h2><Link className="accent-text" href={href("/app/alerts", branchParam)}>View all &gt;</Link></div>
        <Tabs label="Priority action categories" value={tab} onChange={(v) => url.set({ queue: v === "all" ? null : v })} tabs={[{ value: "all", label: "All" }, { value: "pricing", label: "Pricing" }, { value: "leads", label: "Leads" }, { value: "integrations", label: "Integrations" }]} idPrefix="queue" />
        <RemotePanel title="Priority actions" remote={remote} rows={5}>
          {filtered.length === 0 ? (
            <EmptyState title="All caught up">No open actions in {rangeLabel.toLowerCase()} for {scope.label}. Charts above remain available.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="data-table" aria-label="Priority actions">
                <thead><tr><th style={{ width: 116 }}>Priority</th><th style={{ width: 260 }}>Record</th><th>Reason</th><th style={{ width: 130 }}>Due</th><th style={{ width: 160 }}>Owner</th><th style={{ width: 144 }}>Action</th></tr></thead>
                <tbody>
                  {filtered.slice(0, 6).map((a) => {
                    const rec = recordLabel(a);
                    const act = actionFor(a);
                    return (
                      <tr key={a.id}>
                        <td><strong>{a.severity}</strong></td>
                        <td><span className="row-title">{rec.title}</span><span className="sub">{rec.sub}</span></td>
                        <td>{a.trigger}</td>
                        <td>{a.dueLabel === "Now" || a.dueLabel === "Today" || a.dueLabel === "Overdue" ? a.dueLabel : `${formatTime(a.dueAt)} IST`}</td>
                        <td>{a.owner}</td>
                        <td><Link href={act.to} className={a.severity === "Warning" ? "warn-text" : "accent-text"} style={{ fontWeight: 600 }}>{act.label}</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </RemotePanel>
      </section>

      <footer className="meta order-foot">
        Snapshot {formatDateTime(SNAPSHOT_AT)} / {state.tenant.timezone === "Asia/Kolkata" ? "Asia/Kolkata" : state.tenant.timezone} / Calculated from your workspace records {demoState === "partial" ? <Badge tone="warn">Incomplete: partial data</Badge> : null}
        {scope.value === ALL_BRANCHES ? " / Totals span all permitted branches" : ""}
      </footer>

      <VehicleDrawer open={addOpen} onClose={() => setAddOpen(false)} defaultBranch={scope.ids[0] ?? ""} key={addOpen ? "open" : "closed"} />
      <Drawer open={Boolean(monthDrawer)} onClose={() => setMonthDrawer(null)} size="w480" title={monthDrawer ? `${monthLabel(monthDrawer.month)} inventory events` : ""} description={monthDrawer ? `${eventRows.filter((e) => e.type === "acquired").length} acquired · ${eventRows.filter((e) => e.type === "sold").length} sold${monthDrawer.type ? ` · filtered to ${monthDrawer.type}` : ""}` : undefined}
        footer={<><Button onClick={() => setMonthDrawer(null)}>Close</Button><Link className="btn btn-primary" href={href("/app/reports", { tab: "inventory", ...branchParam })}>Open in Reports</Link></>}>
        <table className="chart-data-table" style={{ width: "100%" }}><caption className="sr-only">Inventory events</caption>
          <thead><tr><th scope="col">Event</th><th scope="col">Vehicle</th><th scope="col">Record</th><th scope="col">Date</th></tr></thead>
          <tbody>{eventRows.map((e) => <tr key={e.id}><td>{e.type === "acquired" ? "Acquired" : "Sold"}</td><td>{e.label}</td><td>{e.ref}</td><td>{formatDate(e.at)}</td></tr>)}</tbody></table>
        {eventRows.length === 0 ? <p className="muted">No events {MISSING} for this month in the selected scope.</p> : null}
      </Drawer>
    </div>
  );
}
