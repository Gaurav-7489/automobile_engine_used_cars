import { tenantConfig } from "@vandlabs/data";
export { tenantConfig };
export const activeDealership = tenantConfig.organization.dealerships.find(d=>d.id===tenantConfig.activeDealershipId)!;
export function locationName(id:string) { return tenantConfig.organization.dealerships.flatMap(d=>d.locations).find(l=>l.id===id)?.name??"Dealership"; }
