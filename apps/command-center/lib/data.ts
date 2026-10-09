import { headers } from "next/headers";
import { staffSnapshot, staffDirectory, tenantConfig } from "@vandlabs/data";
import { resolvePrincipal } from "./auth";
export async function commandData() {
  const h=await headers();
  const request=new Request(process.env.APP_ORIGIN || "http://localhost:3001",{headers:h});
  const principal=await resolvePrincipal(request);
  const [snapshot,staffOptions]=await Promise.all([staffSnapshot(principal),staffDirectory(principal)]);
  return {...snapshot,staffOptions,assignedLeadOnly:principal.assignedLeadOnly,capabilities:principal.capabilities,inventoryDestinations:principal.tenantId===tenantConfig.tenantId?tenantConfig.organization.dealerships.filter(d=>principal.dealershipIds.includes(d.id)).flatMap(d=>d.locations.filter(l=>principal.locationIds.includes(l.id)).map(l=>({dealershipId:d.id,locationId:l.id,label:`${d.brandName} · ${l.city}`}))):[]};
}
