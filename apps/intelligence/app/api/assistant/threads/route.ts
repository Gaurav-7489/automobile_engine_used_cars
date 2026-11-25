import { json, problem } from "@/lib/api";
import { listThreads } from "@/lib/server/ai/history";
import { getPrincipal } from "@/lib/server/auth";
import { tenantTx } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/** The signed-in member's own saved assistant conversations, newest first. */
export async function GET() {
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Your session has expired. Sign in again.");
  const { principal } = current;
  return json({ threads: await tenantTx(principal.tenantId, (c) => listThreads(c, principal.tenantId, principal.userId, 50)) });
}
