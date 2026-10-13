import Link from "next/link";
import { headers } from "next/headers";
import { dealerCommerce } from "@vandlabs/data/commerce";
import { resolvePrincipal } from "../../lib/auth";
import { AcquisitionPlanner } from "../../components/acquisition-planner";
export const dynamic = "force-dynamic";
export default async function Page() {
  const p = await resolvePrincipal(new Request(process.env.APP_ORIGIN || "http://localhost:3001", { headers: await headers() }));
  const summary = await (await dealerCommerce()).summary(p);
  const active = summary.subscription?.status === "active" && Date.parse(summary.subscription.expiresAt) > Date.now();
  return <main className="main"><div className="page-head"><p className="eyebrow">VandLabs dealer intelligence</p><h1>Put your capital into the right cars.</h1><p className="muted">Plan stock purchases for resale with your budget, location and business objective.</p><Link href="/subscriptions">Manage subscription →</Link>{" · "}<Link href="/data-sources">Connect sourcing data →</Link></div><AcquisitionPlanner plan={active ? summary.subscription!.plan : null} demo={summary.demo} readOnly={summary.readOnly} /></main>;
}
