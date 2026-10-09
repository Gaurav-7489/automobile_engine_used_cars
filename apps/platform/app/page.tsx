import { platformData } from "../lib/runtime";
import { PlatformView } from "../components/platform-view";
export const dynamic="force-dynamic";
export default async function Page(){return <PlatformView tenants={await platformData()}/>;}
