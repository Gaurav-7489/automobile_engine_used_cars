import Link from "next/link";
import { capitalInsights } from "@vandlabs/data/capital-insights";
import { dataMode } from "@vandlabs/data";
import { cockpitData } from "../../lib/cockpit";
import { money, shortDateTime } from "../../lib/format";
import { CostForm } from "../../components/cost-form";
import { Bars, KpiBand, type BarRow, type Kpi } from "../../components/cockpit/ui";
import { DivergingBars, InsightList, StackedBar } from "../../components/cockpit/charts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Capital & profit | Command Center" };

const signed = (n: number) => `${n < 0 ? "−" : "+"}${money(Math.abs(n))}`;
const views = [{ key: "unsold", label: "Unsold" }, { key: "uncosted", label: "Needs costs" }, { key: "sold", label: "Sold" }, { key: "all", label: "All" }] as const;
const sorts = [{ key: "age", label: "Oldest first" }, { key: "capital", label: "Most capital" }, { key: "spread", label: "Lowest spread" }, { key: "stock", label: "Stock ID" }] as const;
const tagLabel: Record<string, string> = { current: "Current", watch: "Watch · 30+ days", review: "Review · 60+ days", priority: "Priority · 90+ days", unknown: "No cost record", closed: "Sold" };

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string; sort?: string }> }) {
  const { data, cockpit, access } = await cockpitData();
  if (!access.capital) return <main className="main"><section className="panel"><h1>Capital access restricted</h1><p>Your account needs capital-read permission to view stock economics.</p></section></main>;
  const query = await searchParams;
  const view = views.find(v => v.key === query.view)?.key ?? "unsold", sort = sorts.find(s => s.key === query.sort)?.key ?? "age";
  const now = new Date(cockpit.asOf), demo = dataMode() === "demo";
  const costs = data.costs ?? [], result = capitalInsights(data.vehicles, costs, data.sales ?? [], now), { report } = result;
  const costFor = (id: string) => costs.find(c => c.vehicleId === id);
  const spreadOf = new Map(result.spreads.map(s => [s.vehicleId, s]));
  const saleOf = new Map(result.sales.map(s => [s.vehicleId, s]));

  const agedShare = report.recordedCapital > 0 ? Math.round(report.agedCapital / report.recordedCapital * 1000) / 10 : null;
  const sold = result.sales, revenue = sold.reduce((n, s) => n + s.amount, 0);
  const kpis: Kpi[] = [
    report.coveredVehicles === 0 ? { label: "Recorded capital", value: "No costs recorded", unavailable: true, detail: `0 of ${report.activeVehicles} unsold vehicles have a cost record. Missing costs are never treated as zero.`, href: "#vehicle-economics", linkLabel: "Record a cost" }
      : { label: "Recorded capital", value: money(report.recordedCapital), detail: `Purchase, reconditioning, transfer and other costs of ${report.coveredVehicles} costed unsold ${report.coveredVehicles === 1 ? "vehicle" : "vehicles"}` },
    report.coveredVehicles === 0 ? { label: "Aged 90+ days", value: "Needs costs", unavailable: true, detail: "Age comes from the recorded acquisition date." }
      : { label: "Aged 90+ days", value: money(report.agedCapital), detail: agedShare === null ? "No capital recorded" : `${agedShare}% of recorded capital` },
    { label: "Cost coverage", value: `${report.coveredVehicles} / ${report.activeVehicles}`, detail: report.uncoveredVehicles ? `${report.uncoveredVehicles} unsold ${report.uncoveredVehicles === 1 ? "vehicle needs" : "vehicles need"} a cost record` : "Every unsold vehicle is costed", href: report.uncoveredVehicles ? "?view=uncosted#vehicle-economics" : undefined, linkLabel: "Show them" },
    sold.length === 0 ? { label: "Recorded contribution", value: "No costed sale yet", unavailable: true, detail: "Appears once a confirmed sale has a vehicle cost record." }
      : { label: "Recorded contribution", value: signed(report.realizedContribution), detail: `${sold.length} costed ${sold.length === 1 ? "sale" : "sales"}${revenue > 0 ? ` · ${Math.round(report.realizedContribution / revenue * 1000) / 10}% of revenue` : ""} · before unrecorded expenses` },
  ];

  const ageRows: BarRow[] = cockpit.inventory.aging.map((b, i) => ({ label: b.label, value: b.recordedCapital ?? 0, display: money(b.recordedCapital ?? 0), tone: (i + 1) as BarRow["tone"], note: `${b.vehicles} ${b.vehicles === 1 ? "vehicle" : "vehicles"} · costs on ${b.costCoverage ?? "—"}` }));
  const spreadRows = result.spreads.slice(0, 8).map(s => ({ key: s.vehicleId, label: s.stockId, sub: s.label, value: s.spread, display: signed(s.spread), note: `asking ${money(s.askingPrice)} vs cost ${money(s.costBasis)}${s.spreadPercent !== null ? ` (${s.spreadPercent}%)` : ""}` }));
  const saleRows = result.sales.slice(0, 8).map(s => ({ key: s.vehicleId, label: s.stockId, sub: s.label, value: s.contribution, display: signed(s.contribution), note: `sold ${money(s.amount)} vs cost ${money(s.costBasis)}${s.marginPercent !== null ? ` (${s.marginPercent}% margin)` : ""}` }));
  const mix = result.costMix;

  const rows = data.vehicles.map((vehicle, i) => ({ vehicle, row: report.rows[i], cost: costFor(vehicle.id) })).filter(({ row }) =>
    view === "all" ? true : view === "sold" ? !row.active : view === "uncosted" ? row.active && row.coverage === "missing" : row.active)
    .sort((a, b) => sort === "stock" ? a.vehicle.stockId.localeCompare(b.vehicle.stockId)
      : sort === "capital" ? (b.row.costBasis ?? -1) - (a.row.costBasis ?? -1)
      : sort === "spread" ? (spreadOf.get(a.vehicle.id)?.spread ?? Infinity) - (spreadOf.get(b.vehicle.id)?.spread ?? Infinity)
      : (b.row.ageDays ?? -1) - (a.row.ageDays ?? -1) || a.vehicle.stockId.localeCompare(b.vehicle.stockId));
  const href = (next: { view?: string; sort?: string }) => `/capital?view=${next.view ?? view}&sort=${next.sort ?? sort}#vehicle-economics`;
  const firstUncosted = data.vehicles.find((v, i) => report.rows[i].active && report.rows[i].coverage === "missing");

  return <main className="main">
    <header className="ck-head">
      <div><p className="eyebrow">Capital &amp; profit intelligence</p><h1>Where the money sits.</h1>
        <p className="muted">Recorded costs, asking prices and confirmed sales. Anything without a cost record stays unknown.</p></div>
      <span className="ck-source" data-mode={demo ? "demo" : "live"}>{demo ? "Demonstration data — fictional records" : "Connected operations"}</span>
    </header>
    <KpiBand kpis={kpis} label="Capital headline figures" />

    {report.coveredVehicles === 0 && report.activeVehicles > 0 ? <section className="ck-start" aria-labelledby="ck-start-title">
      <h2 id="ck-start-title">Start with one vehicle</h2>
      <p>Capital, age, margin and every insight on this page are built from the costs you record. Enter the purchase, reconditioning, transfer and other costs for a vehicle and its figures appear immediately; vehicles without a cost record are never counted as zero.</p>
      {firstUncosted ? <p><Link className="ck-open" href={`/capital?view=uncosted#vehicle-${firstUncosted.id}`}>Record costs for {firstUncosted.year} {firstUncosted.make} {firstUncosted.model} <span aria-hidden="true">→</span></Link></p> : null}
    </section> : null}

    <div className="ck-grid">
      <div className="ck-col">
        <section className="panel" aria-labelledby="ck-ins-title">
          <div className="panel-head"><div><h2 id="ck-ins-title">What the records say</h2><p>Findings computed from your recorded costs, prices and sales</p></div></div>
          <InsightList insights={result.insights} />
        </section>
        <section className="panel" aria-labelledby="ck-spread-title">
          <div className="panel-head"><div><h2 id="ck-spread-title">Asking price against cost</h2><p>Unsold, costed vehicles — lowest margin first{result.spreads.length > 8 ? ` (8 of ${result.spreads.length})` : ""}</p></div></div>
          <DivergingBars rows={spreadRows} caption="Asking price minus recorded cost basis, per vehicle" positiveLabel="Asking above cost" negativeLabel="Asking below cost" valueHeading="Spread" empty="No costed, unsold vehicle yet. Record costs to compare each asking price with what the vehicle cost you." />
          <p className="ck-note">Spread excludes tax, finance, overhead and sale expenses. It is a margin before those costs, not profit.</p>
        </section>
      </div>
      <div className="ck-col">
        <section className="panel" aria-labelledby="ck-age-title">
          <div className="panel-head"><div><h2 id="ck-age-title">Capital by age</h2><p>Recorded capital in unsold stock, by days held</p></div></div>
          <Bars rows={ageRows} caption="Recorded capital per age band; darker is older" valueHeading="Recorded capital" empty="No unsold stock." />
          {result.holding ? <p className="ck-note">Estimated holding cost accrued so far on {result.holding.vehicles} {result.holding.vehicles === 1 ? "vehicle" : "vehicles"}: <strong>{money(result.holding.accrued)}</strong>, from your own daily holding assumption.</p> : <p className="ck-note">No daily holding assumption is recorded, so holding cost is not estimated.</p>}
        </section>
        <section className="panel" aria-labelledby="ck-mix-title">
          <div className="panel-head"><div><h2 id="ck-mix-title">Where the cost goes</h2><p>Unsold-stock cost by type</p></div></div>
          {mix ? <StackedBar parts={[{ key: "purchase", label: "Purchase price", value: mix.purchase, display: money(mix.purchase) }, { key: "reconditioning", label: "Reconditioning", value: mix.reconditioning, display: money(mix.reconditioning) }, { key: "transfer", label: "Transfer", value: mix.transfer, display: money(mix.transfer) }, { key: "other", label: "Other", value: mix.other, display: money(mix.other) }]} caption={`Recorded cost of ${mix.vehicles} costed unsold ${mix.vehicles === 1 ? "vehicle" : "vehicles"}`} total={money(mix.total)} valueHeading="Recorded cost" />
            : <p className="ck-empty">Appears once at least one unsold vehicle has a cost record.</p>}
        </section>
        <section className="panel" aria-labelledby="ck-sales-title">
          <div className="panel-head"><div><h2 id="ck-sales-title">Contribution per sale</h2><p>Confirmed sales with a cost record — lowest first</p></div></div>
          <DivergingBars rows={saleRows} caption="Sale price minus recorded cost basis, per sale" positiveLabel="Sold above cost" negativeLabel="Sold below cost" valueHeading="Contribution" empty="No confirmed sale has a cost record yet. Contribution is never estimated for sales without costs." />
        </section>
      </div>
    </div>

    <section className="panel ck-econ" id="vehicle-economics" aria-labelledby="ck-econ-title">
      <div className="panel-head"><div><h2 id="ck-econ-title">Vehicle economics</h2><p>{rows.length} {rows.length === 1 ? "vehicle" : "vehicles"} shown · record or amend costs on any row</p></div></div>
      <nav className="ck-filters" aria-label="Show vehicles">{views.map(v => <Link key={v.key} href={href({ view: v.key })} aria-current={view === v.key ? "page" : undefined}>{v.label}</Link>)}</nav>
      <nav className="ck-filters" aria-label="Sort vehicles">{sorts.map(s => <Link key={s.key} href={href({ sort: s.key })} aria-current={sort === s.key ? "page" : undefined}>{s.label}</Link>)}</nav>
      {rows.length ? <table>
        <thead><tr><th scope="col">Vehicle</th><th scope="col">Age</th><th className="num" scope="col">Cost basis</th><th className="num" scope="col">Holding est.</th><th className="num" scope="col">Asking</th><th className="num" scope="col">Spread / contribution</th><th scope="col">Review</th><th scope="col">Costs</th></tr></thead>
        <tbody>{rows.map(({ vehicle, row, cost }) => { const spread = spreadOf.get(vehicle.id), saleRow = saleOf.get(vehicle.id); const delta = saleRow ? saleRow.contribution : spread?.spread;
          return <tr key={vehicle.id} id={`vehicle-${vehicle.id}`}>
            <th scope="row">{vehicle.stockId}<small>{vehicle.year} {vehicle.make} {vehicle.model}</small></th>
            <td data-label="Age">{row.ageDays === null ? "Unknown" : `${row.ageDays} days`}{cost ? <small>acquired {cost.acquiredOn}</small> : <small>no acquisition date</small>}</td>
            <td className="num" data-label="Cost basis">{row.costBasis === null ? "Unknown" : money(row.costBasis)}</td>
            <td className="num" data-label="Holding est.">{row.holdingEstimate === null ? "—" : money(row.holdingEstimate)}</td>
            <td className="num" data-label="Asking">{row.active ? money(vehicle.price) : "—"}</td>
            <td className="num" data-label={saleRow ? "Sale contribution" : "Asking spread"}>{delta === undefined ? "Unknown" : <span className={delta < 0 ? "ck-neg" : "ck-pos"}>{signed(delta)}</span>}{saleRow && saleRow.marginPercent !== null ? <small>{saleRow.marginPercent}% margin</small> : spread?.spreadPercent != null ? <small>{spread.spreadPercent}% of cost</small> : null}</td>
            <td data-label="Review"><span className="ck-tag" data-tag={row.priority}>{tagLabel[row.priority]}</span></td>
            <td data-label="Costs"><CostForm vehicleId={vehicle.id} record={cost} /></td>
          </tr>; })}</tbody>
      </table> : <p className="ck-empty">{view === "uncosted" ? "Every unsold vehicle has a cost record." : "No vehicles match this view."}</p>}
    </section>

    <details className="panel ck-method" style={{ marginTop: 12 }}>
      <summary>Evidence &amp; assumptions</summary>
      <ul>{report.assumptions.map(a => <li key={a}>{a}</li>)}</ul>
    </details>
    <section className="panel" style={{ marginTop: 12 }} aria-labelledby="ck-hist-title">
      <div className="panel-head"><div><h2 id="ck-hist-title">Cost change history</h2><p>Every recorded cost entry, newest first</p></div></div>
      {data.costHistory?.length ? <ul className="ck-agenda">{data.costHistory.map(c => <li key={c.id}>
        <time dateTime={c.after.recordedAt}>{shortDateTime(c.after.recordedAt)}</time>
        <div><strong>{data.vehicles.find(v => v.id === c.vehicleId)?.stockId ?? c.vehicleId} · version {c.after.version}</strong><p>{money(c.after.purchasePrice)} purchase · recorded by {c.after.recordedBy} · ref {c.after.reference}</p></div></li>)}</ul>
        : <p className="ck-empty">No cost records entered yet. Reference vehicles carry no invented costs.</p>}
    </section>
  </main>;
}
