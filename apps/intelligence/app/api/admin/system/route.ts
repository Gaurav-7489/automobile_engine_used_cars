import { json } from "@/lib/api";
import { adminSystemApi } from "@/lib/server/admin-gate";
import { systemReport } from "@/lib/server/system-health";

export const dynamic = "force-dynamic";

/** Live system health, build and test facts for platform administrators. No dealership data. */
export async function GET() {
  const gate = await adminSystemApi();
  if (!gate.ok) return gate.error;
  return json({ ...(await systemReport()), twoFactor: gate.twoFactor }, { headers: { "Cache-Control": "no-store" } });
}
