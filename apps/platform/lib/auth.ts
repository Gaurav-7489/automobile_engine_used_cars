import { createPrincipalResolver } from "@vandlabs/server-auth";
import { requireCapability } from "@vandlabs/contracts";
export const resolvePrincipal = createPrincipalResolver({demoPrincipal:{userId:"demo-platform-admin",tenantId:"demo-platform",dealershipIds:[],locationIds:[],capabilities:["platform:admin"]}});
export async function authorizePlatform(request:Request){const principal=await resolvePrincipal(request);requireCapability(principal,"platform:admin");return principal;}
