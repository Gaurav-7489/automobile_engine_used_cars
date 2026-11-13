"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AGE_BUCKETS } from "@/lib/finance";
import { ALL_BRANCHES } from "@/lib/fixtures/branches";
import { formatDate, formatDateTime, formatMoney, formatTime, monthLabel, monthName, MISSING } from "@/lib/format";
import { getMonths, SNAPSHOT_AT } from "@/lib/time";
import { HBars, GroupedBars } from "../charts-lazy";
import { Drawer } from "../overlay";
import { RemotePanel } from "../panel";
import { useRemote } from "../use-remote";
import { Badge, Button, EmptyState, InfoTip, Kpi } from "../ui";
import { FollowUps } from "./follow-ups";
import { Icon } from "../icons";
import dynamic from "next/dynamic";
import { LazyMount } from "../lazy-mount";

// The add-vehicle form is only downloaded when someone opens it.
const VehicleDrawer = dynamic(() => import("../inventory/vehicle-drawer").then((m) => m.VehicleDrawer), { ssr: false });
import { defaultBranchOf, useScopedHref, useWorkspace } from "../workspace";
import type { Alert, InventoryEvent, Lead, Vehicle } from "@/lib/domain";
import type { StockMetrics } from "@/lib/finance";

type OverviewData = { metrics: StockMetrics; movement: { month: string; acquired: number; sold: number }[]; hasStock: boolean; alerts: Alert[]; alertTotal: number; records: { vehicles: Vehicle[]; leads: Lead[] } };
const ZERO_AGE = { "0-15": 0, "16-30": 0, "31-45": 0, ">45": 0 };
const ZERO_METRICS: StockMetrics = { unsold: 0, available: 0, reserved: 0, preparation: 0, landedCapital: 0, ageing: 0, estimatedGross: 0, grossExcluded: 0, availableByAge: ZERO_AGE, capitalByAge: ZERO_AGE };

export function OverviewPage() {
  const { state, scope, can, demoState, mergeRecords } = useWorkspace();
  const href = useScopedHref();
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [monthDrawer, setMonthDrawer] = useState<{ month: string; type?: "acquired" | "sold" } | null>(null);
  // Aggregated in the database for the permitted branches; the browser never receives the stock or lead lists to compute these.
  const remote = useRemote<OverviewData>(`/api/overview?branches=${scope.ids.join(",")}`, (d) => mergeRecords({ vehicles: d.records.vehicles, leads: d.records.leads }));
  const model = { metrics: remote.data?.metrics ?? ZERO_METRICS, movement: remote.data?.movement ?? getMonths().map((month) => ({ month, acquired: 0, sold: 0 })), hasStock: remote.data?.hasStock ?? true };
  const m = model.metrics;
  const rank = { Critical: 0, Warning: 1, Info: 2 } as Record<string, number>;
  const filtered = [...(remote.data?.alerts ?? [])].sort((x, y) => (rank[x.severity] ?? 3) - (rank[y.severity] ?? 3));
  const { session } = useWorkspace();
  const istHour = new Date(Date.now() + 330 * 60_000).getUTCHours();
  const greeting = `${istHour < 12 ? "Good morning" : istHour < 17 ? "Good afternoon" : "Good evening"}${session.name ? `, ${session.name.split(" ")[0]}` : ""}`;
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
    if (v) return { title: `${v.year} ${v.make} ${v.model}`, sub: `${v.id} · ${v.status === "preparation" ? "In preparation" : v.status[0].toUpperCase() + v.status.slice(1)}` };
    const l = state.leads.find((x) => x.id === a.recordRef);
    if (l) return { title: l.name, sub: `${l.id} · ${l.vehicleId ?? "No car chosen"} · ${l.source}` };
    return { title: a.recordRef, sub: a.type };
  };

  const empty = !model.hasStock && demoState === "empty";

  return (
    <div className="page overview">
      <header className="ov-hero">
        <div>
          <h1 className="h1" id="page-title" tabIndex={-1}>{greeting}</h1>
          <p className="muted">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })} · {scope.label}</p>
        </div>
        {can("inventory.edit") ? <Button variant="primary" className="primary-cta" onClick={() => setAddOpen(true)}>Add vehicle</Button> : null}
      </header>

      {empty ? (
        <EmptyState title="Set up your workspace" actions={<><Button variant="primary" onClick={() => setAddOpen(true)}>Add first vehicle</Button><Link href={href("/app/inventory", { import: "1" })} className="btn">Import stock</Link><Link href="/onboarding" className="btn btn-ghost">Resume setup</Link></>}>
          No stock or feeds are connected yet. Market estimates are unavailable until a licensed source is connected, so no history is shown. Percentage changes appear once a comparison period exists.
        </EmptyState>
      ) : null}

      <section aria-label="Key figures" className="order-kpi">
        <RemotePanel title="Key figures" remote={remote} rows={2}>
          <div className="kpi-grid">
            <Kpi icon="car" label="Available stock" value={m.available} note="Available vehicles" href={invHref({ tab: "available" })} />
            <Kpi icon="coins" label="Landed capital" value={formatMoney(m.landedCapital)} note={`Stock as of ${formatDate(SNAPSHOT_AT).slice(0, 6)}`} href={href("/app/capital", branchParam)} />
            <Kpi icon="clock" label="Ageing >45 days" value={m.ageing} note="Needs review" tone="warn" href={invHref({ tab: "available", age: ">45" })} />
            <Kpi icon="chart" label="Est. gross at asking" value={formatMoney(m.estimatedGross)} note="Estimate, not yet earned" href={href("/app/capital", { ...branchParam, definition: "gross" })}
              info={<InfoTip label="About estimated gross at asking">Asking price minus landed cost for cost-complete, priced, available vehicles. {m.grossExcluded} record(s) excluded for missing cost. Not a realized result.</InfoTip>} />
          </div>
        </RemotePanel>
      </section>

      <div className="ov-split">
      <FollowUps />
      <section aria-labelledby="pa-title" className="order-actions card ov-card">
        <div className="section-title"><h2 className="h3" id="pa-title">Needs attention</h2><Link className="accent-text" href={href("/app/alerts", branchParam)}>All</Link></div>
        <RemotePanel title="Priority actions" remote={remote} rows={5}>
          {filtered.length === 0 ? (
            <p className="muted ov-empty">All caught up. Nothing needs attention right now.</p>
          ) : (
            <ul className="pa-list" aria-label="Priority actions">
              {filtered.slice(0, 5).map((a) => {
                const rec = recordLabel(a);
                const act = actionFor(a);
                const tone = a.severity === "Critical" ? "danger" : a.severity === "Warning" ? "warn" : "neutral";
                const due = a.dueLabel === "Now" || a.dueLabel === "Today" || a.dueLabel === "Overdue" ? a.dueLabel : a.dueAt ? `${formatTime(a.dueAt)} IST` : "No date";
                return (
                  <li key={a.id} className={`pa-item ${tone}`}>
                    <span className="pa-ico" aria-hidden="true"><Icon name={a.type === "Pricing" ? "tag" : a.type === "Leads" ? "users" : a.type === "Integration" ? "link" : "alert"} size={18} /></span>
                    <div className="pa-body">
                      <div className="pa-top"><span className="row-title">{rec.title}</span><Badge tone={tone}>{a.severity}</Badge></div>
                      <p className="pa-reason">{a.trigger}</p>
                      <span className="meta">{rec.sub} · {due === "No date" ? "No due date" : `Due ${due}`} · {a.owner}</span>
                    </div>
                    <Link href={act.to} className="btn btn-sm pa-go" aria-label={`${act.label}: ${rec.title}`}>{act.label}<Icon name="arrowRight" size={16} /></Link>
                  </li>
                );
              })}
            </ul>
          )}
        </RemotePanel>
      </section>
      </div>

      <LazyMount height={380}>
      <div className="split-60 order-charts" style={{ gridTemplateColumns: "minmax(0, 720fr) minmax(0, 416fr)" }}>
        <section className="card order-movement" aria-labelledby="mv-title">
          <div className="card-head"><h2 className="h3" id="mv-title">Inventory movement</h2><span className="meta">Acquired / Sold · {monthLabel(getMonths()[0])} to {monthLabel(getMonths()[getMonths().length - 1])}</span></div>
          <RemotePanel title="Inventory movement" remote={remote} rows={5}>
            <GroupedBars title="Inventory movement" unit="vehicles" data={model.movement.map((d) => ({ label: monthName(d.month), values: [d.acquired, d.sold], ariaLabel: `${monthLabel(d.month)}: acquired ${d.acquired}, sold ${d.sold}. Open matching inventory events.` }))}
              series={[{ name: "Acquired", color: "var(--accent)" }, { name: "Sold", color: "var(--info)" }]} onSelect={(i, s) => setMonthDrawer({ month: getMonths()[i], type: s === 0 ? "acquired" : "sold" })} />
          </RemotePanel>
        </section>
        <section className="card order-age" aria-labelledby="age-title">
          <div className="card-head"><h2 className="h3" id="age-title">Stock age · {m.available} on sale</h2></div>
          <RemotePanel title="Stock age" remote={remote} rows={4}>
            <HBars max={Math.max(...days.map((d) => d.count), 1) * 1.15} data={days.map((d) => ({ label: d.label.replace(" days", "d"), value: d.count, display: String(d.count), tone: d.key === ">45" ? "warn" : "accent", onSelect: () => router.push(invHref({ tab: "available", age: d.key })), ariaLabel: `${d.label}: ${d.count} available. Open age-filtered stock.` }))} />
            <p className="meta mt-4">Age buckets sum to available stock ({days.reduce((a, d) => a + d.count, 0)}). Reserved and in-preparation records are in landed capital, not in this count.</p>
          </RemotePanel>
        </section>
      </div>


      </LazyMount>

      <footer className="meta order-foot">Updated {formatDateTime(SNAPSHOT_AT)}{scope.value === ALL_BRANCHES ? " · all your branches" : ""}{demoState === "partial" ? <> · <Badge tone="warn">Partial data</Badge></> : null}</footer>

      {addOpen ? <VehicleDrawer open={addOpen} onClose={() => setAddOpen(false)} defaultBranch={scope.ids[0] ?? ""} key="open" /> : null}
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
