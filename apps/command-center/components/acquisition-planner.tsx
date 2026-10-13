"use client";
import { useState } from "react";
import { acquisitionOptions, dealerPlans, demoOpportunities, type DealerPlan } from "../lib/acquisition";
const money = (value: number) => "₹" + value.toLocaleString("en-IN");
export function AcquisitionPlanner() {
  const [budget, setBudget] = useState("1000000");
  const [reserve, setReserve] = useState("50000");
  const [city, setCity] = useState("Kochi");
  const [plan, setPlan] = useState<DealerPlan>("growth");
  const [count, setCount] = useState<1 | 2>(2);
  const [goal, setGoal] = useState<"margin" | "demand">("margin");
  let error = "";
  let options: ReturnType<typeof acquisitionOptions> = [];
  try { options = acquisitionOptions({ budget: budget === "" ? NaN : Number(budget), reserve: reserve === "" ? NaN : Number(reserve), city, plan, count, goal }, demoOpportunities); }
  catch (e) { error = e instanceof Error ? e.message : "Check your planning inputs."; }
  return <>
    <section className="panel"><p className="eyebrow">Dealer acquisition planner</p><h2>What should your dealership buy next?</h2>
      <p className="notice">Interactive demonstration using fictional sourcing prices, resale estimates and demand scores. No live listings, AI model or paid subscription is connected.</p>
      <div className="operations-form"><div className="operations-grid">
        <label><span>Available capital (INR)</span><input type="number" min="1" step="1" value={budget} onChange={e => setBudget(e.target.value)} /></label>
        <label><span>Cash reserve (INR)</span><input type="number" min="0" step="1" value={reserve} onChange={e => setReserve(e.target.value)} /></label>
        <label><span>Dealership location</span><select value={city} onChange={e => setCity(e.target.value)}><option>Kochi</option><option>Bengaluru</option></select></label>
        <label><span>Preview subscription</span><select value={plan} onChange={e => { const next = e.target.value as DealerPlan; setPlan(next); if (next === "starter") setCount(1); }}>{dealerPlans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label><span>Buying strategy</span><select value={count} onChange={e => setCount(Number(e.target.value) as 1 | 2)}><option value={1}>One car</option><option value={2} disabled={plan === "starter"}>Two cars · Growth / Scale</option></select></label>
        <label><span>Rank by</span><select value={goal} onChange={e => setGoal(e.target.value as typeof goal)}><option value="margin">Estimated gross margin</option><option value="demand">Illustrative demand score</option></select></label>
      </div></div>
      <p className="muted">{plan === "starter" ? "Starter preview searches the selected city." : "Growth / Scale preview compares both demo cities. Transport allowances are fictional and must be replaced with route-specific quotations."}</p>
    </section>
    <section className="panel" aria-live="polite"><h2>Budget-fit acquisition options</h2>
      {error ? <p role="alert">{error}</p> : options.length === 0 ? <p>No options fit this budget after the reserve. Adjust your budget, reserve or buying strategy.</p> : <div className="stack-list">{options.slice(0, 5).map((o, i) => <article className="acquisition-option" key={o.cars.map(c => c.id).join("+")}>
        <p className="eyebrow">{i === 0 ? "Top fit for your selected objective" : `Alternative ${i}`} · fictional example</p>
        <h3>{o.cars.map(c => c.model).join(" + ")}</h3>
        <p>{o.cars.map(c => `${c.city}: purchase ${money(c.purchase)}, preparation ${money(c.preparation)}, transport ${money(c.transport)}`).join("; ")}</p>
        <dl className="acquisition-facts"><div><dt>Landed cost</dt><dd>{money(o.landedCost)}</dd></div><div><dt>Estimated gross margin</dt><dd>{money(o.margin)}</dd></div><div><dt>Unallocated after reserve</dt><dd>{money(o.unallocated)}</dd></div><div><dt>Illustrative demand</dt><dd>{o.demand.toFixed(0)} / 100</dd></div></dl>
        <p className="muted">Fits your capital after reserve; ranked by {goal === "margin" ? "estimated gross margin" : "average illustrative demand"}. Resale total: {money(o.landedCost + o.margin)}. Margin excludes taxes, financing, holding, overhead and sale expenses. Inspection and price verification required.</p>
      </article>)}</div>}
    </section>
  </>;
}
