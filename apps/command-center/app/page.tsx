import Link from "next/link";
import { redirect } from "next/navigation";
import { commandLanding } from "@vandlabs/contracts";
import { dataMode, tenantConfig } from "@vandlabs/data";
import { cockpitData } from "../lib/cockpit";
import { money } from "../lib/format";
import { ActionList, Bars, KpiBand, Meter, type BarRow, type Kpi } from "../components/cockpit/ui";

export const dynamic = "force-dynamic";

const time = (iso: string) => new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(new Date(iso));
const dayKey = (iso: string | number | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(iso));

export default async function Page() {
  const { data, cockpit, access, canResolve } = await cockpitData();
  if (!access.leads) redirect(commandLanding({ capabilities: data.capabilities }));
  const demo = dataMode() === "demo", { inventory, capital, profit, pipeline } = cockpit;
  const dealership = tenantConfig.organization.dealerships.find(d => d.id === tenantConfig.activeDealershipId);

  const kpis: Kpi[] = [
    { label: "Unsold stock", value: String(inventory.active), detail: `${inventory.available} available · ${inventory.reserved} reserved · ${inventory.unpublished} not published`, href: "/inventory", linkLabel: "Inventory" },
    !capital ? { label: "Capital in stock", value: "Needs capital access", unavailable: true, detail: "Costs are visible only to roles with capital access." }
      : capital.covered === 0 ? { label: "Capital in stock", value: "No costs recorded", unavailable: true, detail: `0 of ${capital.active} unsold vehicles have a cost record. Missing costs are never treated as zero.`, href: "/capital", linkLabel: "Record costs" }
      : { label: "Capital in stock", value: money(capital.recorded), detail: `${capital.covered} of ${capital.active} vehicles costed · ${money(capital.aged90)} aged 90+ days`, href: "/capital", linkLabel: "Capital detail" },
    !profit ? { label: "Recorded contribution", value: "Needs capital access", unavailable: true, detail: "Contribution needs sale and cost records." }
      : profit.sales === 0 ? { label: "Recorded contribution", value: "No costed sale yet", unavailable: true, detail: "Appears once a confirmed sale has a vehicle cost record." }
      : { label: "Recorded contribution", value: money(profit.realizedContribution), detail: `${profit.sales} costed ${profit.sales === 1 ? "sale" : "sales"}${profit.marginPercent !== null ? ` · ${profit.marginPercent}% of revenue` : ""} · before unrecorded expenses, not net profit`, href: "/capital", linkLabel: "Profit detail" },
    { label: "Open pipeline", value: String(pipeline!.open), detail: `${pipeline!.uncontacted} awaiting first contact · ${pipeline!.won + pipeline!.lost === 0 ? "no closed leads yet" : `${pipeline!.won} of ${pipeline!.won + pipeline!.lost} closed leads won`}`, href: "/pipeline", linkLabel: "Pipeline" },
  ];

  const stageRows: BarRow[] = pipeline!.stages.map((s, i) => ({ label: s.label, value: s.count, display: String(s.count), tone: (i < 2 ? 1 : i < 5 ? 2 : 3) as BarRow["tone"] }));
  const ageRows: BarRow[] = inventory.aging.map((b, i) => ({ label: b.label, value: b.vehicles, display: `${b.vehicles}`, tone: (i + 1) as BarRow["tone"],
    note: b.recordedCapital === null ? "capital not visible to your role" : b.vehicles === 0 ? undefined : `${money(b.recordedCapital)} recorded capital · costs on ${b.costCoverage} vehicles` }));
  const today = dayKey(cockpit.asOf);
  const agenda = data.appointments.filter(a => a.status === "scheduled" && dayKey(a.scheduledAt) === today).sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  const leadName = (id: string) => data.leads.find(l => l.id === id)?.name ?? "Customer";
  const vehicleLabel = (id?: string) => { const v = data.vehicles.find(x => x.id === id); return v ? `${v.year} ${v.make} ${v.model}` : "Vehicle not specified"; };

  return <main className="main">
    <header className="ck-head">
      <div>
        <p className="eyebrow">Dealer cockpit · {dealership?.name ?? "Dealership"}</p>
        <h1>Today, decided.</h1>
        <p className="muted">{new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date(cockpit.asOf))} · figures are counts and sums of recorded data</p>
      </div>
      <span className="ck-source" data-mode={demo ? "demo" : "live"}>{demo ? "Demonstration data — fictional records" : "Connected operations"}</span>
    </header>

    <KpiBand kpis={kpis} label="Headline figures" />

    <div className="ck-grid">
      <div className="ck-col">
      <section className="panel" aria-labelledby="ck-actions-title">
        <div className="panel-head">
          <div><h2 id="ck-actions-title">Required actions</h2><p>Derived from your records; each resolves when its cause is fixed.</p></div>
          <div className="ck-count" aria-label={`${cockpit.counts.total} open actions`}>
            {cockpit.counts.critical ? <span data-severity="critical">{cockpit.counts.critical} critical</span> : null}
            <span>{cockpit.counts.total} open</span>
            {cockpit.counts.total > 6 ? <Link href="/actions">View all →</Link> : null}
          </div>
        </div>
        <ActionList actions={cockpit.actions} canResolve={canResolve} limit={6} />
      </section>

      <section className="panel" aria-labelledby="ck-today-title">
        <div className="panel-head"><div><h2 id="ck-today-title">Today</h2><p>Scheduled visits and test drives</p></div><Link href="/appointments">Appointments →</Link></div>
        {agenda.length ? <ul className="ck-agenda">{agenda.map(a => <li key={a.id}>
          <time dateTime={a.scheduledAt}>{time(a.scheduledAt)}</time>
          <div><strong>{leadName(a.leadId)}</strong><p>{a.type === "test_drive" ? "Test drive" : "Visit"} · {vehicleLabel(a.vehicleId)}</p></div>
          <Link className="ck-open" href={`/leads/${a.leadId}`}>Open</Link></li>)}</ul>
          : <p className="ck-empty">No visits or test drives are scheduled for today.</p>}
      </section>
      </div>

      <div className="ck-col">
      <section className="panel" aria-labelledby="ck-pipe-title">
        <div className="panel-head"><div><h2 id="ck-pipe-title">Sales pipeline</h2><p>Open leads by stage</p></div><Link href="/pipeline">Open board →</Link></div>
        <Bars rows={stageRows} caption="Leads currently in each open stage" valueHeading="Leads" empty="No open leads. New enquiries from the website and imports appear here." />
        <dl className="ck-stats">
          <div><dt>Won</dt><dd>{pipeline!.won}</dd></div><div><dt>Lost</dt><dd>{pipeline!.lost}</dd></div><div><dt>Nurture</dt><dd>{pipeline!.nurture}</dd></div>
          <div><dt>Asking value of enquired cars</dt><dd>{pipeline!.enquiredVehicles ? money(pipeline!.askingValue) : "—"}</dd></div>
        </dl>
        <p className="ck-note">Asking value sums the listed price of vehicles with an open enquiry. It is not a revenue forecast.</p>
      </section>

      <section className="panel" aria-labelledby="ck-age-title">
        <div className="panel-head"><div><h2 id="ck-age-title">Stock age</h2><p>Unsold vehicles by days in stock</p></div><Link href="/inventory">Inventory →</Link></div>
        <Bars rows={ageRows} caption="Unsold vehicles per age band; darker is older" valueHeading="Vehicles" empty="No unsold stock." />
        <p className="ck-note">Age uses the recorded acquisition date where a cost record exists, otherwise the listing date. {inventory.unknownAge ? `${inventory.unknownAge} vehicles have no usable date.` : ""}</p>
      </section>


      </div>

      {cockpit.plan ? <section className="panel wide" aria-labelledby="ck-plan-title">
        <div className="panel-head"><div><h2 id="ck-plan-title">Plan usage</h2><p>{cockpit.plan.state === "unsubscribed" ? "No subscription record — Starter limits apply" : cockpit.plan.state === "inactive" ? "Subscription is not active" : `${cockpit.plan.plan[0].toUpperCase()}${cockpit.plan.plan.slice(1)} plan`} · limits are enforced by the server</p></div><Link href="/subscriptions">Subscription →</Link></div>
        <div className="ck-meters">{cockpit.plan.meters.map(m => <Meter key={m.key} label={m.label} used={m.used} limit={m.limit} />)}</div>
      </section> : null}
    </div>
  </main>;
}
