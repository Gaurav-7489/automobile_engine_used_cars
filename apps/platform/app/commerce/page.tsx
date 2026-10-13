import { platformData } from "../../lib/runtime";
import { CommerceManager } from "../../components/commerce-manager";
export const dynamic = "force-dynamic";
export default async function Page() {
  const tenants = await platformData();
  return <main><div className="page-head"><p className="eyebrow">Platform commercial operations</p><h1>Subscriptions & source rights</h1><p className="lede">Provision access and data agreements only within your authorized organizations.</p></div><CommerceManager tenants={tenants.map(t => ({ tenantId: t.tenantId, organization: t.organization }))} /></main>;
}
