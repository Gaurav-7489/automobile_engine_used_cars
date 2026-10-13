"use client";
import { useState } from "react";
import type { AcquisitionReport, CommercePlan } from "@vandlabs/contracts";
import { dealerAction } from "./dealer-fetch";
const money = (value: number | null) => value === null ? "Unknown" : "₹" + value.toLocaleString("en-IN");
const locations = { Kochi: { latitude: 9.9312, longitude: 76.2673 }, Bengaluru: { latitude: 12.9716, longitude: 77.5946 }, Delhi: { latitude: 28.6139, longitude: 77.209 }, Mumbai: { latitude: 19.076, longitude: 72.8777 } };
export function AcquisitionPlanner({ plan, demo }: { plan: CommercePlan | null; demo: boolean }) {
  const [city, setCity] = useState("Kochi"), [report, setReport] = useState<(AcquisitionReport & { usage: { monthlyUsed: number; monthlyLimit: number } }) | null>(null);
  const [latitude, setLatitude] = useState("9.9312"), [longitude, setLongitude] = useState("76.2673");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <>
    <section className="panel"><p className="eyebrow">Dealer acquisition intelligence</p><h2>What should your dealership buy next?</h2>
      <p className="notice">{demo ? "Local demonstration with fictional sourcing and fuel values. Every recommendation is calculated by the backend under the selected demo subscription." : "Recommendations use your approved sourcing feeds. Missing facts remain unknown; verify condition, availability and quotations before buying."}</p>
      <form className="operations-form" onSubmit={e => {
        e.preventDefault(); const f = new FormData(e.currentTarget); setBusy(true); setError(""); setReport(null);
        const numeric = (name: string) => Number(f.get(name));
        void dealerAction("recommendations", { city, latitude: Number(latitude), longitude: Number(longitude), budget: numeric("budget"), reserve: numeric("reserve"), radiusKm: numeric("radiusKm"), count: numeric("count"), goal: f.get("goal"), fuel: f.get("fuel"), transportPerKm: numeric("transportPerKm"), dailyHoldingCost: numeric("dailyHoldingCost"), holdingDays: numeric("holdingDays"), annualKm: numeric("annualKm") }).then(setReport).catch(err => setError(err instanceof Error ? err.message : "Could not calculate recommendations.")).finally(() => setBusy(false));
      }}><fieldset disabled={busy || !plan}><legend>Acquisition constraints</legend><div className="operations-grid">
        <label><span>Available capital (INR)</span><input name="budget" type="number" required min="1" max="100000000" step="1" defaultValue="1000000" /></label>
        <label><span>Cash reserve (INR)</span><input name="reserve" type="number" required min="0" step="1" defaultValue="50000" /></label>
        <label><span>Dealership location</span><input list="dealer-cities" value={city} required onChange={e => { const city = e.target.value; setCity(city); const coordinates = locations[city as keyof typeof locations]; if (coordinates) { setLatitude(String(coordinates.latitude)); setLongitude(String(coordinates.longitude)); } }} /><datalist id="dealer-cities">{Object.keys(locations).map(c => <option key={c} value={c} />)}</datalist></label>
        <label><span>Dealership latitude</span><input type="number" step="any" min="-90" max="90" value={latitude} required onChange={e => setLatitude(e.target.value)} /></label>
        <label><span>Dealership longitude</span><input type="number" step="any" min="-180" max="180" value={longitude} required onChange={e => setLongitude(e.target.value)} /></label>
        <label><span>Search radius (km)</span><input name="radiusKm" type="number" min="0" max="3000" required defaultValue="600" /></label>
        <label><span>Buying strategy</span><select name="count" defaultValue="1"><option value="1">One car</option><option value="2" disabled={plan === "starter"}>Two cars · Growth / Scale</option></select></label>
        <label><span>Rank by</span><select name="goal"><option value="margin">Estimated gross contribution</option><option value="demand">Source demand score</option></select></label>
        <label><span>Fuel preference</span><select name="fuel">{["any", "petrol", "diesel", "hybrid", "electric"].map(fuel => <option key={fuel}>{fuel}</option>)}</select></label>
        <label><span>Transport assumption (INR / km)</span><input name="transportPerKm" type="number" min="0" max="1000" required defaultValue="20" /></label>
        <label><span>Daily holding cost (INR)</span><input name="dailyHoldingCost" type="number" min="0" max="10000" required defaultValue="100" /></label>
        <label><span>Expected holding days</span><input name="holdingDays" type="number" min="0" max="365" required defaultValue="30" /></label>
        <label><span>Customer annual driving (km)</span><input name="annualKm" type="number" min="0" max="200000" required defaultValue="12000" /></label>
      </div><button type="submit">{busy ? "Calculating…" : "Find budget-fit acquisitions"}</button></fieldset></form>
      {!plan ? <p className="notice">An active dealership subscription is required. Open Subscriptions to check your access.</p> : <p className="muted">Active plan: {plan}. Entitlements and usage limits are enforced on the server.</p>}
      {error ? <p role="alert">{error}</p> : null}
    </section>
    {report ? <section className="panel" aria-live="polite"><h2>Budget-fit acquisition options</h2><p>{report.candidates} eligible sourcing vehicles · {report.usage.monthlyUsed} / {report.usage.monthlyLimit} monthly requests</p>
      {!report.options.length ? <p>No acquisitions fit these constraints. Change the budget, reserve, radius or strategy, or connect a feed with suitable stock.</p> : <div className="stack-list">{report.options.map((option, i) => <article className="acquisition-option" key={option.cars.map(c => c.id).join("+")}>
        <p className="eyebrow">{i === 0 ? "Top fit for your objective" : `Alternative ${i}`}{report.demo ? " · fictional example" : ""}</p>
        <h3>{option.cars.map(c => `${c.year} ${c.make} ${c.model}`).join(" + ")}</h3>
        {option.cars.map(car => <p key={car.id}>{car.city}, {car.state} · {car.distanceKm.toFixed(0)} km straight-line · {car.fuel} · {car.odometerKm.toLocaleString("en-IN")} km<br/>Purchase {money(car.purchasePrice)} · preparation {money(car.preparationCost)} · transfer {money(car.transferFees)} · estimated transport {money(car.transportEstimate)}<br/>Customer annual fuel estimate: {money(car.annualFuelEstimate)} · source {car.sourceId} · observed {car.observedAt.slice(0, 10)}</p>)}
        <dl className="acquisition-facts"><div><dt>Total landed + holding estimate</dt><dd>{money(option.landedCost)}</dd></div><div><dt>Estimated gross contribution range</dt><dd>{money(option.marginLow)} – {money(option.marginHigh)}</dd></div><div><dt>Unallocated after reserve</dt><dd>{money(option.remaining)}</dd></div><div><dt>Source demand score</dt><dd>{option.demandScore === null ? "Unknown" : `${option.demandScore} / 100`}</dd></div></dl>
        <p className="muted">{option.explanation}</p>
      </article>)}</div>}
      {report.ai?.status === "available" ? <aside className="notice"><h3>AI commentary</h3><p>{report.ai.text}</p><small>{report.ai.model} · verify commentary against the structured report above.</small></aside> : <p className="muted">AI commentary {report.ai?.status === "unavailable" ? "is temporarily unavailable" : "is not configured"}. The acquisition calculations and evidence are shown above.</p>}
      {report.notices.map(notice => <p className="notice" key={notice}>{notice}</p>)}
    </section> : null}
  </>;
}
