import { notFound } from "next/navigation";
import { platformData } from "../../lib/runtime";
import { PlatformView } from "../../components/platform-view";
const valid=new Set(["dealerships","organizations","onboarding","health","integrations","features","audit","staff"]);
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{section:string}>}) {
  const {section}=await params;if(!valid.has(section))notFound();
  return <PlatformView section={section} tenants={await platformData()}/>;
}
