"use client";

import { useMemo, useState } from "react";
import { createCampaign } from "@/lib/actions";
import { stockAgeDays } from "@/lib/finance";
import { formatMoney, formatRupees } from "@/lib/format";
import { recommendPlan, type MarketingPlan } from "@/lib/marketing-plan";
import type { Vehicle } from "@/lib/domain";
import { useToast } from "../toast";
import { Badge, Button, EmptyState, SelectField } from "../ui";
import { useUrlState, useWorkspace } from "../workspace";

const PRIORITY_TONE = { "act now": "warn", steady: "accent", "light touch": "neutral" } as const;

/** One recommended plan per car on sale. VandLabs recommends; the team reviews, adjusts and approves the campaign it starts. */
export function PlansView({ vehicles }: { vehicles: Vehicle[] }) {
  const { state, can, run } = useWorkspace();
  const url = useUrlState();
  const toast = useToast();
  const [sort, setSort] = useState("priority");
  const city = (v: Vehicle) => state.branches.find((b) => b.id === v.branchId)?.city ?? "";
  const plans = useMemo(() => {
    const now = new Date().toISOString();
    const rank = { "act now": 0, steady: 1, "light touch": 2 };
    return vehicles.map((v) => ({ vehicle: v, plan: recommendPlan({ vehicle: v, city: city(v), daysInStock: stockAgeDays(v, now) }) }))
      .sort((a, b) => sort === "priority" ? rank[a.plan.priority] - rank[b.plan.priority] || (b.vehicle.asking ?? 0) - (a.vehicle.asking ?? 0) : (b.vehicle.asking ?? 0) - (a.vehicle.asking ?? 0));
  }, [vehicles, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = (v: Vehicle) => {
    const r = run((s, a) => createCampaign(s, a, v.id, true));
    if (!r.ok) { toast(r.message, "error"); return; }
    url.set({ view: null, campaign: r.campaign.id, step: 5 });
    toast("Draft created from the plan. Review it, adjust anything, then submit for approval.");
  };

  if (!plans.length) return <EmptyState title="No cars on sale">Plans appear for every car that is on sale.</EmptyState>;
  return (
    <div className="stack">
      <div className="spread" style={{ flexWrap: "wrap" }}>
        <p className="muted" style={{ margin: 0, maxWidth: 640 }}>A plan for each car from its own record: who is likely to buy it, what they worry about, how to show it and where. You review, adjust and approve; nothing is spent until a person approves.</p>
        <div style={{ minWidth: 200 }}><SelectField label="Sort" value={sort} onChange={(e) => setSort(e.target.value)} options={[{ value: "priority", label: "Needs attention first" }, { value: "price", label: "Price: high to low" }]} /></div>
      </div>
      <div className="plan-grid">
        {plans.map(({ vehicle: v, plan }) => <PlanCard key={v.id} vehicle={v} plan={plan} onStart={can("campaign.edit") ? () => start(v) : undefined} />)}
      </div>
    </div>
  );
}

function PlanCard({ vehicle: v, plan, onStart }: { vehicle: Vehicle; plan: MarketingPlan; onStart?: () => void }) {
  const [more, setMore] = useState(false);
  return (
    <article className="card plan-card" aria-labelledby={`plan-${v.id}`}>
      <div className="spread"><Badge tone={PRIORITY_TONE[plan.priority]}>{plan.priority}</Badge><span className="meta">{plan.segmentLabel}</span></div>
      <h3 className="h3" id={`plan-${v.id}`}>{v.year} {v.make} {v.model}</h3>
      <span className="meta">{[v.id, formatMoney(v.asking), `${v.km.toLocaleString("en-IN")} km`].join(" · ")}</span>
      <dl className="plan-facts">
        <div><dt>Likely buyer</dt><dd>{plan.buyer}</dd></div>
        <div><dt>Angle</dt><dd>{plan.angle}</dd></div>
        <div><dt>Where</dt><dd>{plan.channels.filter((c) => c.share > 0).map((c) => `${c.name} ${c.share}%`).join(" · ")} · {plan.audience.area}, {plan.audience.radiusKm} km</dd></div>
        <div><dt>Budget</dt><dd>{formatRupees(plan.budget.daily)} a day · {formatRupees(plan.budget.total30)} for 30 days</dd></div>
      </dl>
      {more ? (
        <div className="stack-sm">
          <div><span className="label">Buyer concerns to answer</span><ul className="plan-list">{plan.concerns.map((c) => <li key={c}>{c}</li>)}</ul></div>
          <div><span className="label">Content ideas</span><ul className="plan-list">{plan.content.map((c) => <li key={c}>{c}</li>)}</ul></div>
          <div><span className="label">Suggested ad text</span><p className="plan-copy"><strong>{plan.headline}</strong><br />{plan.body}</p></div>
          <div><span className="label">Why</span><ul className="plan-list">{plan.reasons.map((c) => <li key={c}>{c}</li>)}<li>{plan.budget.why}</li></ul></div>
        </div>
      ) : null}
      <div className="row-flex plan-actions">
        <button type="button" className="link-btn" onClick={() => setMore((m) => !m)} aria-expanded={more}>{more ? "Less" : "Full plan"}</button>
        {onStart ? <Button size="sm" variant="primary" onClick={onStart}>Start draft from plan</Button> : null}
      </div>
    </article>
  );
}
