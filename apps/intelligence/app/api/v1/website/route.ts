import { withApiKey } from "@/lib/server/public-api";
import { websiteInfo } from "@/lib/server/website-connect";
import { deliverSoon } from "@/lib/server/website-webhooks";

export const dynamic = "force-dynamic";

/** A connected website checks its link here: which workspace it reads from, and when the link expires. */
export async function GET(request: Request) {
  // The website checks in every few minutes; that is also when any inventory webhook it missed is retried.
  return withApiKey(request, "inventory:read", (caller) => { deliverSoon(caller.tenantId); return websiteInfo(caller.tenantId, caller.keyId); });
}
