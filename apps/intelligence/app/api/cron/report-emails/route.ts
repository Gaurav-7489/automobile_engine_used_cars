import { json } from "@/lib/api";
import { runReportCron } from "@/lib/server/report-delivery";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily scheduled-report job. Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`; anyone else gets 401. */
export async function GET(request: Request) {
  try {
    const outcome = await runReportCron(request.headers.get("authorization"));
    return json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error(JSON.stringify({ event: "report_cron_failure", message: error instanceof Error ? error.message : "unknown" }));
    return json({ error: "unavailable" }, { status: 503 });
  }
}
