import Link from "next/link";
import { headers } from "next/headers";
import { dealerCommerce, CommerceError } from "@vandlabs/data/commerce";
import { resolvePrincipal } from "../../lib/auth";
export const dynamic = "force-dynamic";
const money = (value: number | null) => value === null ? "Unavailable" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const input = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const principal = await resolvePrincipal(new Request(process.env.APP_ORIGIN || "http://localhost:3001", { headers: await headers() }));
  let report;
  try { report = await (await dealerCommerce()).marketIntelligence(principal, input); }
  catch (error) {
    if (!(error instanceof CommerceError) || ![400, 402].includes(error.status)) throw error;
    return <main className="main"><div className="page-head"><h1>Market Intelligence</h1></div><section className="panel" role="alert"><h2>{error.status === 402 ? "An active subscription is required" : "Check your filters"}</h2><p>{error.message}</p><Link href={error.status === 402 ? "/subscriptions" : "/market"}>{error.status === 402 ? "Manage subscription" : "Reset market filters"}</Link></section></main>;
  }
  const pageLink = (page: number) => "/market?" + new URLSearchParams({ ...Object.fromEntries(Object.entries(input).filter((entry): entry is [string, string] => typeof entry[1] === "string")), page: String(page) }).toString();
  return <main className="main market-workspace">
    <div className="page-head"><p className="eyebrow">Evidence before acquisition</p><h1>Market Intelligence</h1><p className="muted">Compare permitted asking-price records. Keep purchase quotes and actual sale prices separate.</p></div>
    <section className="panel"><details><summary>Filter comparable records</summary><form action="/command/market" method="get" className="market-filters">
      {[["make", "Make"], ["model", "Model"], ["city", "City"], ["sourceId", "Source ID"]].map(([key, label]) => <label key={key}>{label}<input name={key} defaultValue={input[key] ?? ""} maxLength={120} /></label>)}
      <label>Fuel<select name="fuel" defaultValue={input.fuel ?? ""}><option value="">All fuels</option>{["petrol", "diesel", "electric", "hybrid"].map(fuel => <option key={fuel} value={fuel}>{fuel}</option>)}</select></label>
      <label>Transmission<select name="transmission" defaultValue={input.transmission ?? ""}><option value="">All transmissions</option><option value="manual">Manual</option><option value="automatic">Automatic</option></select></label>
      {[["minYear", "Minimum year", 1900, new Date().getUTCFullYear() + 1], ["maxYear", "Maximum year", 1900, new Date().getUTCFullYear() + 1], ["maxKm", "Maximum odometer (km)", 0, 2000000], ["minPrice", "Minimum asking price (INR)", 0, 100000000], ["maxPrice", "Maximum asking price (INR)", 0, 100000000], ["maxAgeDays", "Maximum observation age (days)", 1, 90]].map(([key, label, min, max]) => <label key={key}>{label}<input type="number" name={String(key)} min={min} max={max} step="1" defaultValue={input[String(key)] ?? (key === "maxAgeDays" ? "7" : "")} /></label>)}
      <button type="submit">Compare asking prices</button><Link href="/market">Reset filters</Link>
    </form></details></section>
    {report.demo ? <p role="status" className="panel">Demonstration records included. These are fictional examples, not live market data.</p> : null}
    <section className="panel" aria-label="Asking-price summary"><h2>{report.coverage.matching} comparable asking-price records</h2><div className="market-metrics"><div><p className="muted">Median asking price</p><strong>{money(report.distribution.median)}</strong></div><div><p className="muted">Middle 50% of asking prices</p><strong>{money(report.distribution.q1)} – {money(report.distribution.q3)}</strong></div><div><p className="muted">Permitted sources represented</p><strong>{report.coverage.sources}</strong></div></div><p>Observation range: {report.coverage.oldestObservationAt ?? "No evidence"} to {report.coverage.latestObservationAt ?? "No evidence"}. Freshness window: {report.filters.maxAgeDays} days.</p></section>
    <section className="panel"><h2>Evidence and limitations</h2><ul>{report.notices.map(notice => <li key={notice}>{notice}</li>)}</ul>{!report.coverage.matching ? <p>No eligible asking-price evidence matches these filters. <Link href="/data-sources">Review approved sources and imports</Link>.</p> : null}</section>
    {report.cities.length ? <section className="panel"><h2>Regional asking-price comparison</h2><div className="table-wrap"><table><caption>Selected records grouped by city; vehicle mix may differ</caption><thead><tr><th>City</th><th>Records</th><th>Median asking price</th></tr></thead><tbody>{report.cities.map(city => <tr key={city.city}><td>{city.city}</td><td>{city.count}</td><td>{money(city.median)}</td></tr>)}</tbody></table></div></section> : null}
    <section className="panel"><h2>Comparable evidence</h2>{report.items.map(item => <article className="acquisition-option" key={item.id}><h3>{item.year} {item.make} {item.model}</h3><p>{money(item.askingPrice.amount)} asking · {item.city} · {item.odometerKm.toLocaleString("en-IN")} km · {item.fuel} · {item.transmission}</p><p>Source: {item.source}{item.demo ? " · Fictional demo record" : ""}. Observed: {item.askingPrice.observedAt}</p><p>{item.evidence}</p></article>)}<nav aria-label="Comparable pages">{report.filters.page > 1 ? <Link href={pageLink(report.filters.page - 1)}>Previous records</Link> : null}{" "}{report.filters.page * report.pageSize < report.coverage.matching ? <Link href={pageLink(report.filters.page + 1)}>Next records</Link> : null}</nav></section>
  </main>;
}
