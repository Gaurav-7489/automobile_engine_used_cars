import { requireCapability } from "@vandlabs/contracts";
import { tenantConfig } from "@vandlabs/data";
import { dispatchNotifications } from "@vandlabs/data/notifications";
import { api } from "@vandlabs/data/http";
import { resolvePrincipal } from "../../../lib/auth";
export async function POST(request:Request) {
  return api(async()=>{const principal=await resolvePrincipal(request);requireCapability(principal,"lead:write");return Response.json(await dispatchNotifications(tenantConfig.tenantId));});
}
