import { headers } from "next/headers";
import type { PlatformTenant } from "@vandlabs/contracts";
import { platformSnapshot, runtimeReadiness } from "@vandlabs/data";
import { dealerCommerce } from "@vandlabs/data/commerce";
import { buildPlatformOverview } from "@vandlabs/data/platform-overview";
import { authorizePlatform } from "./auth";
export async function platformData() {
  const principal=await authorizePlatform(new Request(process.env.APP_ORIGIN||"http://localhost:3002",{headers:await headers()}));
  return platformSnapshot(principal);
}
export async function platformOverviewData(tenants:PlatformTenant[]) {
  const principal=await authorizePlatform(new Request(process.env.APP_ORIGIN||"http://localhost:3002",{headers:await headers()}));
  let slices=null;
  try {slices=await (await dealerCommerce()).platformSlices(principal);}
  catch {console.error(JSON.stringify({event:"platform_overview_commerce_unavailable"}));}
  // Reference mode is incomplete by design; configuration alerts are only meaningful for shared environments.
  const shared=["aurora","neon"].includes(process.env.DATA_MODE ?? "");
  return buildPlatformOverview(tenants,slices,shared?runtimeReadiness("platform"):null,new Date());
}
