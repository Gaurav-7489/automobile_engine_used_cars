import Link from "next/link";
import { commandData } from "../../lib/data";
import { AcquisitionPlanner } from "../../components/acquisition-planner";
export const dynamic = "force-dynamic";
export default async function Page() {
  await commandData();
  return <main className="main"><div className="page-head"><p className="eyebrow">VandLabs dealer intelligence</p><h1>Put your capital into the right cars.</h1><p className="muted">Plan stock purchases for resale with your budget, location and business objective.</p><Link href="/subscriptions">Explore the three dealer plans →</Link></div>
    {process.env.AUTH_MODE === "demo" && process.env.DATA_MODE !== "aurora" ? <AcquisitionPlanner /> : <section className="panel"><h2>Live acquisition planning is not connected</h2><p>Verified sourcing feeds and server-side subscription entitlements are required before recommendations can be enabled. The fictional planner is available in explicit demo mode only.</p></section>}
  </main>;
}
