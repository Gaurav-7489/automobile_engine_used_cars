import Link from "next/link";
import { headers } from "next/headers";
import { requireCommandPage } from "@vandlabs/contracts";
import { dataMode, tenantConfig } from "@vandlabs/data";
import { deadStockAccess, deadStockReport } from "@vandlabs/data/dead-stock";
import { costBasis } from "@vandlabs/data/price-approval";
import { commandData } from "../../lib/data";
import { resolvePrincipal } from "../../lib/auth";
import { money, number, shortDateTime } from "../../lib/format";
import { InventoryIntake } from "../../components/inventory-intake";
import { InventoryOperations } from "../../components/business-operations";
import { DecisionControls, PriceRequestForm } from "../../components/price-requests";
import { KpiBand, type Kpi } from "../../components/cockpit/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inventory intelligence | Command Center" };

const views = [{ key: "all", label: "All unsold" }, { key: "review", label: "Needs review" }, { key: "aged", label: "Aged 90+ days" }, { key: "unpublished", label: "Not published" }] as const;
const actionLabel = { inspect: "Inspect", publish: "Publish", promote: "Promote", review_price: "Review price", follow_up: "Follow up" } as const;
const reasonText = { below_cost: "Below recorded cost", large_drop: "Drop over 10%" } as const;
const statusText = { pending: "Waiting for decision", approved: "Approved and applied", rejected: "Rejected", stale: "Vehicle changed — not applied" } as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const request = new Request(process.env.APP_ORIGIN || "http://localhost:3001", { headers: await headers() });
  const [data, principal, query] = await Promise.all([commandData(), resolvePrincipal(request), searchParams]);
  requireCommandPage(principal, "/command/inventory");
  const view = views.find(v => v.key === query.view)?.key ?? "all", now = new Date(), demo = dataMode() === "demo";
  const canWrite = principal.capabilities.includes("inventory:write"), canApprove = principal.capabilities.includes("capital:write"), capital = principal.capabilities.includes("capital:read");
  const report = deadStockReport(data, now, undefined, deadStockAccess(principal));
  const costs = data.costs ?? [], requests = data.priceRequests ?? [];
  const pendingBy = new Map(requests.filter(r => r.status === "pending").map(r => [r.vehicleId, r]));
  const vehicleOf = (id: string) => data.vehicles.find(v => v.id === id);
  const label = (id: string) => { const v = vehicleOf(id); return v ? `${v.stockId} · ${v.year} ${v.make} ${v.model}` : id; };
  const lastBand = report.bands.at(-1)?.label;

  const rows = report.vehicles.filter(r => view === "all" ? true : view === "review" ? r.recommendations.length > 0 : view === "aged" ? r.band === lastBand : vehicleOf(r.vehicleId)?.publishStatus !== "published");
  const reviewCount = report.vehicles.filter(r => r.recommendations.length > 0).length, aged = report.vehicles.filter(r => r.band === lastBand).length;
  const kpis: Kpi[] = [
    { label: "Unsold stock", value: String(report.vehicles.length), detail: `${report.vehicles.filter(r => vehicleOf(r.vehicleId)?.publishStatus !== "published").length} not published` },
    { label: "Needs review", value: String(reviewCount), detail: reviewCount ? "Each has evidence and a suggested next step" : "No vehicle triggers a review rule", href: reviewCount ? "?view=review#intelligence" : undefined, linkLabel: "Show them" },
    { label: "Aged 90+ days", value: String(aged), detail: report.unknownAge ? `${report.unknownAge} with no usable date` : "Age from acquisition or listing date", href: aged ? "?view=aged#intelligence" : undefined, linkLabel: "Show them" },
    { label: "Price approvals", value: String(pendingBy.size), detail: pendingBy.size ? "Waiting for an owner decision" : "Nothing waiting", href: pendingBy.size ? "#approvals" : undefined, linkLabel: "Review" },
  ];
  const dealership = tenantConfig.organization.dealerships.find(d => d.id === tenantConfig.activeDealershipId)!;
  const href = (key: string) => `/inventory?view=${key}#intelligence`;
  const decided = requests.filter(r => r.status !== "pending").slice(0, 5);

  return <main className="main">
    <header className="ck-head"><div><p className="eyebrow">Inventory intelligence</p><h1>Stock that needs a decision.</h1>
      <p className="muted">Age, price, interest and profit for every unsold vehicle, with the evidence behind each prompt. Prompts never change a price on their own.</p></div>
      <span className="ck-source" data-mode={demo ? "demo" : "live"}>{demo ? "Demonstration data — fictional records" : "Connected operations"}</span></header>
    <KpiBand kpis={kpis} label="Inventory headline figures" />

    <section className="panel" id="approvals" aria-labelledby="inv-appr-title" style={{ marginTop: 12 }}>
      <div className="panel-head"><div><h2 id="inv-appr-title">Price approvals</h2><p>A price cut below recorded cost, or over 10%, needs an owner. Anyone can request one; only an owner decides.</p></div></div>
      {pendingBy.size ? <ul className="ck-agenda" aria-label="Pending price requests">{[...pendingBy.values()].map(r => <li key={r.id}>
        <time dateTime={r.requestedAt}>{shortDateTime(r.requestedAt)}</time>
        <div><strong>{label(r.vehicleId)}</strong>
          <p>₹{r.currentPrice.toLocaleString("en-IN")} → ₹{r.proposedPrice.toLocaleString("en-IN")} ({Math.round((r.proposedPrice - r.currentPrice) / r.currentPrice * 1000) / 10}%) · requested by {r.requestedBy}</p>
          <p>“{r.note}”{r.reasons.length ? ` · ${r.reasons.map(x => reasonText[x]).join(", ")}` : ""}</p>
          {canApprove ? (r.requestedBy === principal.userId ? <p className="ck-note">You raised this request, so someone else must decide it.</p> : <DecisionControls request={r} />) : <p className="ck-note">{statusText.pending}.</p>}
        </div></li>)}</ul> : <p className="ck-empty">No price request is waiting. {canWrite ? "Use “Request price change” on a vehicle below." : ""}</p>}
      {decided.length ? <details className="ck-method"><summary>Recent decisions</summary><ul>{decided.map(r => <li key={r.id}>{label(r.vehicleId)}: ₹{r.currentPrice.toLocaleString("en-IN")} → ₹{r.proposedPrice.toLocaleString("en-IN")} — {statusText[r.status]}{r.decidedBy ? ` by ${r.decidedBy}` : ""}{r.decisionNote ? ` (“${r.decisionNote}”)` : ""}</li>)}</ul></details> : null}
    </section>

    <section className="panel ck-econ" id="intelligence" aria-labelledby="inv-int-title" style={{ marginTop: 12 }}>
      <div className="panel-head"><div><h2 id="inv-int-title">Aging and pricing</h2><p>{rows.length} {rows.length === 1 ? "vehicle" : "vehicles"} shown · oldest first</p></div></div>
      <nav className="ck-filters" aria-label="Show inventory">{views.map(v => <Link key={v.key} href={href(v.key)} aria-current={view === v.key ? "page" : undefined}>{v.label}</Link>)}</nav>
      {rows.length ? <table aria-label="Inventory intelligence">
        <thead><tr><th scope="col">Vehicle</th><th scope="col">Age</th><th className="num" scope="col">Asking</th><th className="num" scope="col">{capital ? "Margin over cost" : "Margin"}</th><th scope="col">Interest (30 days)</th><th scope="col">Review</th><th scope="col">Price</th></tr></thead>
        <tbody>{rows.map(r => { const v = vehicleOf(r.vehicleId)!, c = costs.find(x => x.vehicleId === r.vehicleId), basis = costBasis(c);
          return <tr key={r.vehicleId} id={`insight-${r.vehicleId}`}>
            <th scope="row">{r.stockId}<small>{r.label}</small></th>
            <td data-label="Age">{r.ageDays === null ? "Unknown" : `${r.ageDays} days`}<small>{r.ageBasis === "acquisition" ? "from acquisition" : r.ageBasis === "listing" ? "from listing date" : "no usable date"}</small></td>
            <td className="num" data-label="Asking">{money(v.price)}<small>{v.publishStatus}</small></td>
            <td className="num" data-label="Margin over cost">{!capital ? "Needs capital access" : basis === null ? "No cost record" : <span className={v.price - basis < 0 ? "ck-neg" : "ck-pos"}>{v.price - basis < 0 ? "−" : "+"}{money(Math.abs(v.price - basis))}</span>}</td>
            <td data-label="Interest">{r.views} views · {r.enquiries === null ? "enquiries unavailable" : `${r.enquiries} ${r.enquiries === 1 ? "enquiry" : "enquiries"}`}</td>
            <td data-label="Review">{r.recommendations.length ? <details><summary>{r.recommendations.map(x => actionLabel[x.action]).join(" · ")}</summary><ul>{r.recommendations.map(x => <li key={x.action}><strong>{x.reason}</strong>{x.evidence.map(e => <p key={e}>{e}</p>)}</li>)}</ul></details> : "No rule triggered"}</td>
            <td data-label="Price">{canWrite ? <PriceRequestForm vehicle={v} pending={pendingBy.get(r.vehicleId)} /> : "Read only"}</td>
          </tr>; })}</tbody></table> : <p className="ck-empty">{view === "all" ? "No unsold stock." : "No vehicle matches this view."}</p>}
      <details className="ck-method"><summary>Evidence &amp; assumptions</summary><ul>{report.assumptions.map(a => <li key={a}>{a}</li>)}{report.unavailable.map(a => <li key={a}>Not available: {a}</li>)}</ul></details>
    </section>

    {canWrite ? <InventoryIntake destinations={data.inventoryDestinations ?? []} /> : null}
    <section className="panel table-panel inventory-cards" style={{ marginTop: 12 }}>
      <div className="panel-head"><div><h2>Vehicle operations</h2><p>Availability, publication and details. Price cuts that need approval are refused here and go through a request.</p></div></div>
      <div className="table-scroll">
        <table role="table" aria-label="Dealership inventory">
          <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Vehicle</th><th scope="col" role="columnheader">Stock</th><th scope="col" role="columnheader">Location</th><th scope="col" role="columnheader">Price</th><th scope="col" role="columnheader">Mileage</th><th scope="col" role="columnheader">Status</th><th scope="col" role="columnheader">Operations</th></tr></thead>
          <tbody role="rowgroup">{data.vehicles.map(vehicle => <tr key={vehicle.id} role="row" id={`vehicle-${vehicle.id}`}>
            <td role="cell" data-label="Vehicle"><span className="mobile-cell-label" aria-hidden="true">Vehicle</span><strong>{vehicle.make} {vehicle.model}</strong><small>{vehicle.variant}</small></td>
            <td role="cell" data-label="Stock"><span className="mobile-cell-label" aria-hidden="true">Stock</span>{vehicle.stockId}</td>
            <td role="cell" data-label="Location"><span className="mobile-cell-label" aria-hidden="true">Location</span>{dealership.locations.find(l => l.id === vehicle.locationId)?.city}</td>
            <td role="cell" data-label="Price"><span className="mobile-cell-label" aria-hidden="true">Price</span>{money(vehicle.price)}</td>
            <td role="cell" data-label="Mileage"><span className="mobile-cell-label" aria-hidden="true">Mileage</span>{number(vehicle.mileage)} km</td>
            <td role="cell" data-label="Status"><span className="mobile-cell-label" aria-hidden="true">Status</span><span className={"stage " + vehicle.availabilityStatus}>{vehicle.availabilityStatus}</span></td>
            <td role="cell" data-label="Operations"><span className="mobile-cell-label" aria-hidden="true">Operations</span>{canWrite ? <InventoryOperations vehicle={vehicle} /> : "Read only"}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  </main>;
}
