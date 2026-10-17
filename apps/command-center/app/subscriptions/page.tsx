import { requireCapability } from "@vandlabs/contracts";
import Link from "next/link";
import { headers } from "next/headers";
import { dealerCommerce } from "@vandlabs/data/commerce";
import { commercePlans, type CommercePlan } from "@vandlabs/contracts";
import { resolvePrincipal } from "../../lib/auth";
import { DemoPlanControl } from "../../components/subscription-controls";
export const dynamic = "force-dynamic";
export default async function Page() {
  const p = await resolvePrincipal(new Request(process.env.APP_ORIGIN || "http://localhost:3001", { headers: await headers() })), summary = await (await dealerCommerce()).summary(p);
  requireCapability(p, "commerce:manage");
  return <main className="main"><div className="page-head"><p className="eyebrow">Built for dealerships</p><h1>Three plans. Smarter stock decisions.</h1><p className="muted">Subscription access is enforced by the backend. Commercial prices and automated checkout are awaiting billing setup.</p></div>
    <section className="panel"><h2>Your subscription</h2><p>{summary.subscription ? `${summary.subscription.plan} · ${summary.subscription.status} · expires ${summary.subscription.expiresAt.slice(0, 10)}` : "No active subscription has been provisioned."}</p><p>{summary.subscription?.reference}</p><Link href="/acquisition">Open acquisition planner →</Link></section>
    <div className="dealer-plan-grid">{(Object.entries(commercePlans) as [CommercePlan, typeof commercePlans[CommercePlan]][]).map(([id, config]) => <section className="panel" key={id}><p className="eyebrow">Dealer intelligence</p><h2>{config.name}</h2><p>Price to be confirmed</p><ul><li>{config.maxCars === 1 ? "Local single-car acquisition" : "One-car and two-car portfolios"}</li><li>{config.crossCity ? "Cross-city sourcing" : "Selected city sourcing"}</li><li>{config.monthlyRequests.toLocaleString("en-IN")} monthly API / planner requests</li><li>{config.maxKeys} active API {config.maxKeys === 1 ? "key" : "keys"}</li><li>{config.perMinute} requests per minute across the dealership</li></ul>{summary.demo && summary.canManage && !summary.readOnly ? <DemoPlanControl plan={id} /> : <p className="muted">Contact VandLabs to activate a contracted subscription.</p>}</section>)}</div>
    <p className="notice">Local demo plan changes do not create payments. Production subscriptions are provisioned only by an authorized platform administrator against a contract or invoice reference.</p>
  </main>;
}
