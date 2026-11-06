import { json, problem } from "@/lib/api";
import { getPrincipal } from "@/lib/server/auth";
import { after } from "next/server";
import { buildShell } from "@/lib/server/shell";
import { deliverPendingLeadEmails, mailConfig } from "@/lib/server/lead-notifications";
import { deliverDueReports } from "@/lib/server/report-delivery";

export const dynamic = "force-dynamic";

export async function GET() {
  const current = await getPrincipal();
  if (!current) return problem(401, "unauthenticated", "Sign in to continue.");
  try {
    const state = await buildShell(current.principal, current.session);
    // Retry any enquiry email that could not be sent earlier (no scheduler needed; this runs after the response).
    // Scheduled report emails that are due (for example, if the daily job was missed) are caught up the same way.
    if (mailConfig()) after(() => deliverPendingLeadEmails(current.principal.tenantId).then(() => deliverDueReports(current.principal.tenantId)).then(() => undefined, () => undefined));
    return json({ state, as_of: new Date().toISOString() });
  } catch (error) {
    console.error(JSON.stringify({ event: "workspace_load_failure", message: error instanceof Error ? error.message : "unknown" }));
    return problem(503, "unavailable", "Your workspace could not be loaded. Try again in a moment.");
  }
}
