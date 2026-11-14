import { withApiKey } from "@/lib/server/public-api";
import { websiteInfo } from "@/lib/server/website-connect";

export const dynamic = "force-dynamic";

/** A connected website checks its link here: which workspace it reads from, and when the link expires. */
export async function GET(request: Request) {
  return withApiKey(request, "inventory:read", (caller) => websiteInfo(caller.tenantId, caller.keyId));
}
