import { platformData, platformOverviewData } from "../lib/runtime";
import { PlatformView } from "../components/platform-view";
export const dynamic="force-dynamic";
export default async function Page(){const tenants=await platformData();return <PlatformView tenants={tenants} overview={await platformOverviewData(tenants)}/>;}
