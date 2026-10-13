import Link from "next/link";
import { commandData } from "../../lib/data";
import { dealerPlans } from "../../lib/acquisition";
export const dynamic = "force-dynamic";
export default async function Page() {
  await commandData();
  return <main className="main"><div className="page-head"><p className="eyebrow">Built for dealerships</p><h1>Three plans. Smarter stock decisions.</h1><p className="muted">Proposed subscription tiers for dealer acquisition intelligence. Pricing, quotas and billing are pending; these cards do not activate access.</p></div>
    <div className="dealer-plan-grid">{dealerPlans.map(plan => <section className="panel" key={plan.id}><p className="eyebrow">{plan.description}</p><h2>{plan.name}</h2><p>Price to be confirmed</p><ul>{plan.features.map(feature => <li key={feature}>{feature}</li>)}</ul><Link href="/acquisition">Explore the planner demo →</Link></section>)}</div>
    <section className="panel"><h2>Your subscription supports your dealership</h2><p>The subscriber is a dealer buying stock for resale. The public vehicle website remains an optional sales channel for that dealer’s retail customers.</p><p>Live access will require an active dealership subscription, role permissions, usage limits and verified data coverage. Plan preview selection is only a demo control.</p></section>
  </main>;
}
