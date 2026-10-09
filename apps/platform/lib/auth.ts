import { createPrincipalResolver } from "@vandlabs/server-auth";
import { requireCapability } from "@vandlabs/contracts";
import { tenantConfig, resolveDatabaseStaff } from "@vandlabs/data";
export const resolvePrincipal = createPrincipalResolver({lookupPrincipal:sub=>resolveDatabaseStaff(sub,tenantConfig.tenantId),demoPrincipal:{userId:"demo-platform-admin",tenantId:"demo-platform",dealershipIds:[],locationIds:[],capabilities:["platform:admin"],platformTenantIds:[tenantConfig.tenantId]}});
export async function authorizePlatform(request:Request){const principal=await resolvePrincipal(request);requireCapability(principal,"platform:admin");return principal;}
