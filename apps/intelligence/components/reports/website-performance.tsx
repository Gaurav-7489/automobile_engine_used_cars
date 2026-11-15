"use client";

import { formatCount, formatDateTime } from "@/lib/format";
import type { WebsitePerformance } from "@/lib/server/website-analytics";
import { useRemote } from "../use-remote";
import { EmptyState, ErrorPanel, Kpi, KpiSkeleton, LinkButton, PageHead, SelectField, TableSkeleton } from "../ui";
import { useUrlState } from "../workspace";

const TYPE_LABEL: Record<string, string> = { vehicle: "Car enquiry", callback: "Call-back", test_drive: "Test drive", price: "Price & finance", sell: "Sell your car", visit: "Showroom visit", general: "General", whatsapp: "WhatsApp form" };

/** How the dealership's own website is doing: visits, car views and the enquiries it produced. Only real, recorded events. */
export function WebsitePerformancePage() {
  const url = useUrlState();
  const days = url.get("days", "30");
  const remote = useRemote<WebsitePerformance>(`/api/website-performance?days=${days}`);
  const d = remote.data;

  return (
    <div className="page">
      <PageHead title="Website performance" lead="Visits, car views and enquiries from your dealership website." />
      <div style={{ maxWidth: 240 }}><SelectField label="Period" value={days} onChange={(e) => url.set({ days: e.target.value === "30" ? null : e.target.value })} options={[{ value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "90", label: "Last 90 days" }]} /></div>
      {!d && remote.status !== "error" ? <><KpiSkeleton count={4} /><TableSkeleton rows={5} columns={3} /></> : null}
      {remote.status === "error" && !d ? <ErrorPanel title="Website performance could not load" message={remote.error} onRetry={remote.reload} /> : null}
      {d && d.connected.length === 0 ? (
        <EmptyState title="No website connected" actions={<LinkButton href="/app/settings/api">Website connections</LinkButton>}>
          When your VandLabs dealership website is connected, its visits, car views and enquiries appear here. The website owner connects it from the website&apos;s /connect page.
        </EmptyState>
      ) : null}
      {d && d.connected.length > 0 ? (
        <>
          <p className="muted">{d.connected.map((c) => `${c.site}${c.lastSeenAt ? ` · last in touch ${formatDateTime(c.lastSeenAt)}` : ""}`).join(" · ")}</p>
          <div className="kpi-grid">
            <Kpi label="Visits" value={formatCount(d.totals.visits)} tone="neutral" />
            <Kpi label="Car views" value={formatCount(d.totals.vehicleViews)} tone="neutral" />
            <Kpi label="Enquiries" value={formatCount(d.totals.enquiries)} note={d.totals.conversionRate === null ? "No visits recorded yet" : `${d.totals.conversionRate}% of visits`} />
            <Kpi label="WhatsApp clicks" value={formatCount(d.totals.whatsappClicks)} note={d.totals.callClicks ? `${formatCount(d.totals.callClicks)} call clicks` : "Clicks, not confirmed leads"} tone="neutral" />
          </div>
          {d.totals.visits === 0 && d.totals.enquiries === 0 ? <EmptyState title="Nothing recorded in this period">Figures appear as customers visit the website. Nothing here is estimated.</EmptyState> : null}
          <div className="two-col">
            <section className="card stack-sm" aria-labelledby="wp-cars">
              <h2 className="h3" id="wp-cars">Most viewed cars</h2>
              {d.topVehicles.length === 0 ? <p className="muted">No car views yet.</p> : (
                <div className="table-wrap fit"><table className="data-table dense" aria-label="Most viewed cars">
                  <thead><tr><th>Car</th><th className="num">Views</th><th className="num">Leads</th></tr></thead>
                  <tbody>{d.topVehicles.map((v) => <tr key={v.stockId}><td><span className="row-title">{v.title}</span><span className="sub">{v.stockId}</span></td><td className="num">{formatCount(v.views)}</td><td className="num">{formatCount(v.enquiries)}</td></tr>)}</tbody>
                </table></div>
              )}
            </section>
            <section className="card stack-sm" aria-labelledby="wp-types">
              <h2 className="h3" id="wp-types">Enquiries by type</h2>
              {d.enquiriesByType.length === 0 ? <p className="muted">No website enquiries yet.</p> : (
                <table className="data-table dense" aria-label="Enquiries by type"><tbody>{d.enquiriesByType.map((e) => <tr key={e.type}><td>{TYPE_LABEL[e.type] ?? e.type}</td><td className="num">{formatCount(e.count)}</td></tr>)}</tbody></table>
              )}
            </section>
            <section className="card stack-sm" aria-labelledby="wp-src">
              <h2 className="h3" id="wp-src">Where visitors came from</h2>
              {d.sources.length === 0 ? <p className="muted">No visits yet.</p> : (
                <table className="data-table dense" aria-label="Traffic sources"><tbody>{d.sources.map((s) => <tr key={s.source}><td>{s.source === "direct" ? "Direct or unknown" : s.source}</td><td className="num">{formatCount(s.visits)}</td></tr>)}</tbody></table>
              )}
              {d.campaigns.length ? <><h3 className="h3">Campaigns</h3><table className="data-table dense" aria-label="Campaigns"><tbody>{d.campaigns.map((c) => <tr key={c.campaign}><td>{c.campaign}</td><td className="num">{formatCount(c.visits)}</td></tr>)}</tbody></table></> : null}
            </section>
            <section className="card stack-sm" aria-labelledby="wp-dev">
              <h2 className="h3" id="wp-dev">Devices</h2>
              {d.devices.length === 0 ? <p className="muted">No visits yet.</p> : (
                <table className="data-table dense" aria-label="Devices"><tbody>{d.devices.map((x) => <tr key={x.device}><td style={{ textTransform: "capitalize" }}>{x.device}</td><td className="num">{formatCount(x.visits)}</td></tr>)}</tbody></table>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
