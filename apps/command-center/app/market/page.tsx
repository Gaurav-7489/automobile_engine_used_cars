import Link from "next/link";
import { headers } from "next/headers";
import { dealerCommerce, CommerceError } from "@vandlabs/data/commerce";
import { resolvePrincipal } from "../../lib/auth";
import { money, shortDateTime } from "../../lib/format";
import { Bars, KpiBand, type BarRow, type Kpi } from "../../components/cockpit/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Market radar | Command Center" };

const level = { insufficient: "Insufficient", low: "Low", medium: "Medium", high: "High" } as const;
const levelNote = { insufficient: "Fewer than five records — no price should be inferred.", low: "Enough records to look at, but too mixed or thin to rely on.", medium: "A narrow cohort with a usable sample from one source or more.", high: "A narrow cohort, at least 15 records and at least two independent sources." } as const;
const primary = [["make", "Make"], ["model", "Model"], ["city", "City"], ["minYear", "Year from"], ["maxYear", "Year to"]] as const;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const input = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const principal = await resolvePrincipal(new Request(process.env.APP_ORIGIN || "http://localhost:3001", { headers: await headers() }));
  let report;
  try { report = await (await dealerCommerce()).marketIntelligence(principal, input); }
  catch (error) {
    if (!(error instanceof CommerceError) || ![400, 402, 403].includes(error.status)) throw error;
    const plan = error.status === 402 || error.status === 403;
    return <main className="main"><header className="ck-head"><div><p className="eyebrow">Market opportunity radar</p><h1>Market radar</h1></div></header><section className="panel" role="alert"><h2>{error.status === 402 ? "An active subscription is required" : error.status === 403 ? "Your plan does not include market intelligence" : "Check your filters"}</h2><p>{error.message}</p><Link className="ck-open" href={plan ? "/subscriptions" : "/market"}>{plan ? "Manage subscription" : "Reset market filters"}</Link></section></main>;
  }
  const { distribution: d, coverage, confidence, freshness } = report;
  const active = Object.entries(input).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== "" && e[0] !== "page" && !(e[0] === "maxAgeDays" && e[1] === "7"));
  const without = (key: string) => "/market?" + new URLSearchParams(active.filter(([k]) => k !== key)).toString();
  const pageLink = (page: number) => "/market?" + new URLSearchParams({ ...Object.fromEntries(active), page: String(page) }).toString();
  const label = (key: string) => [...primary, ["fuel", "Fuel"], ["transmission", "Transmission"], ["maxKm", "Max km"], ["minPrice", "Min price"], ["maxPrice", "Max price"], ["maxAgeDays", "Max age (days)"], ["sourceId", "Source"]].find(([k]) => k === key)?.[1] ?? key;

  const kpis: Kpi[] = coverage.matching === 0
    ? [{ label: "Median asking price", value: "No evidence", unavailable: true, detail: "No eligible asking-price record matches these filters and the freshness window." },
       { label: "Evidence quality", value: level.insufficient, unavailable: true, detail: levelNote.insufficient },
       { label: "Records", value: "0", detail: `${coverage.eligible} eligible records · ${freshness.excludedStale} too old for the ${freshness.windowDays}-day window` },
       { label: "Sources", value: "0", detail: "Only permitted, in-licence sources are used.", href: "/data-sources", linkLabel: "Data sources" }]
    : [{ label: "Median asking price", value: money(d.median!), detail: coverage.matching < 5 ? "Fewer than five records — treat as an anecdote, not a price." : `Middle 50% of asking prices: ${money(d.q1!)} – ${money(d.q3!)}` },
       { label: "Evidence quality", value: level[confidence.level], detail: levelNote[confidence.level] },
       { label: "Records", value: String(coverage.matching), detail: `${coverage.eligible} eligible · ${freshness.excludedStale} too old for the ${freshness.windowDays}-day window` },
       { label: "Freshness", value: freshness.newestAgeDays === 0 ? "Today" : `${freshness.newestAgeDays} d`, detail: `Newest observation; oldest is ${freshness.oldestAgeDays} days old` }];

  const cityRows: BarRow[] = report.cities.filter(c => c.median !== null).map(c => ({ label: c.city, value: c.median!, display: money(c.median!), tone: 2,
    note: `${c.count} ${c.count === 1 ? "record" : "records"}, ${money(c.min!)} – ${money(c.max!)}${c.vsOverallPercent === null ? " · no comparison (sample too small)" : ` · ${c.vsOverallPercent > 0 ? "+" : ""}${c.vsOverallPercent}% vs overall median`}` }));

  return <main className="main market-workspace">
    <header className="ck-head"><div><p className="eyebrow">Market opportunity radar</p><h1>What the market is asking.</h1>
      <p className="muted">Permitted asking-price records only. Quotes, actual sales and projections are kept out of these figures.</p></div>
      {report.demo ? <span className="ck-source" data-mode="demo">Demonstration data — fictional records</span> : <span className="ck-source" data-mode="live">Permitted source records</span>}</header>

    <section className="panel" aria-labelledby="mk-filter-title">
      <h2 id="mk-filter-title" className="sr-only">Filter comparable records</h2>
      <form action="/command/market" method="get" className="mk-filters">
        {primary.map(([key, text]) => <label key={key}><span>{text}</span><input name={key} defaultValue={input[key] ?? ""} maxLength={key.startsWith("m") && key.includes("Year") ? 4 : 120} inputMode={key.includes("Year") ? "numeric" : undefined} /></label>)}
        <details className="mk-more"><summary>More filters</summary><div className="mk-more-grid">
          <label><span>Fuel</span><select name="fuel" defaultValue={input.fuel ?? ""}><option value="">All fuels</option>{["petrol", "diesel", "electric", "hybrid"].map(f => <option key={f} value={f}>{f}</option>)}</select></label>
          <label><span>Transmission</span><select name="transmission" defaultValue={input.transmission ?? ""}><option value="">All</option><option value="manual">Manual</option><option value="automatic">Automatic</option></select></label>
          {[["maxKm", "Max odometer (km)", 0, 2000000], ["minPrice", "Min asking price (₹)", 0, 100000000], ["maxPrice", "Max asking price (₹)", 0, 100000000], ["maxAgeDays", "Max observation age (days)", 1, 90]].map(([key, text, min, max]) => <label key={key}><span>{text}</span><input type="number" name={String(key)} min={min} max={max} step="1" defaultValue={input[String(key)] ?? (key === "maxAgeDays" ? "7" : "")} /></label>)}
          <label><span>Source ID</span><input name="sourceId" defaultValue={input.sourceId ?? ""} maxLength={120} /></label></div></details>
        <div className="mk-actions"><button type="submit">Compare asking prices</button><Link href="/market">Reset</Link></div>
      </form>
      {active.length ? <ul className="mk-chips" aria-label="Active filters">{active.map(([k, v]) => <li key={k}><span>{label(k)}: {v}</span><Link href={without(k)} aria-label={`Remove ${label(k)} filter`}>×</Link></li>)}</ul> : null}
    </section>

    <KpiBand kpis={kpis} label="Market headline figures" />

    <div className="ck-grid">
      <div className="ck-col">
        <section className="panel" aria-labelledby="mk-conf-title">
          <div className="panel-head"><div><h2 id="mk-conf-title">How far to trust this</h2><p>Evidence quality: <strong>{level[confidence.level]}</strong>. This rates the records, not the market.</p></div></div>
          <ul className="ck-evidence">{confidence.reasons.map(r => <li key={r}>{r}</li>)}</ul>
          <details className="ck-method"><summary>Limitations that always apply</summary><ul>{report.notices.map(n => <li key={n}>{n}</li>)}</ul></details>
          {coverage.matching === 0 ? <p className="ck-note">Nothing matches. Widen the filters or the freshness window, or <Link href="/data-sources">review approved sources and imports</Link>.</p> : null}
        </section>
        <section className="panel" aria-labelledby="mk-reg-title">
          <div className="panel-head"><div><h2 id="mk-reg-title">Regional asking prices</h2><p>Median per city; vehicle mix may differ between cities</p></div></div>
          <Bars rows={cityRows} caption="Median asking price per city" valueHeading="Median asking price" empty="No regional comparison without matching records." />
        </section>
      </div>
    </div>
        <section className="panel" style={{ marginTop: 12 }} aria-labelledby="mk-ev-title">
          <div className="panel-head"><div><h2 id="mk-ev-title">Comparable evidence</h2><p>{coverage.matching} {coverage.matching === 1 ? "record" : "records"}, highest asking price first · generated {shortDateTime(report.generatedAt)}</p></div></div>
          {report.items.length ? <div className="table-scroll ck-econ" role="region" aria-label="Comparable asking-price records" tabIndex={0}><table>
            <thead><tr><th scope="col">Vehicle</th><th scope="col">City</th><th className="num" scope="col">Asking</th><th className="num" scope="col">Odometer</th><th scope="col">Observed</th><th scope="col">Source</th></tr></thead>
            <tbody>{report.items.map(i => <tr key={i.id}>
              <th scope="row">{i.year} {i.make} {i.model}<small>{i.fuel} · {i.transmission}</small></th>
              <td data-label="City">{i.city}</td><td className="num" data-label="Asking">{money(i.askingPrice.amount)}</td>
              <td className="num" data-label="Odometer">{i.odometerKm.toLocaleString("en-IN")} km</td>
              <td data-label="Observed">{shortDateTime(i.askingPrice.observedAt)}</td>
              <td data-label="Source">{i.source}{i.demo ? <small>Fictional demo record</small> : null}</td></tr>)}</tbody></table></div>
            : <p className="ck-empty">No eligible asking-price evidence matches these filters.</p>}
          <nav className="ck-filters" aria-label="Comparable pages">{report.filters.page > 1 ? <Link href={pageLink(report.filters.page - 1)}>Previous records</Link> : null}{report.filters.page * report.pageSize < coverage.matching ? <Link href={pageLink(report.filters.page + 1)}>Next records</Link> : null}</nav>
        </section>
  </main>;
}
