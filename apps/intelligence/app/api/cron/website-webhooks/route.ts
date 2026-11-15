import { json } from "@/lib/api";
import { runWebhookCron } from "@/lib/server/website-webhooks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily catch-up for inventory webhooks to connected websites. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  try {
    const outcome = await runWebhookCron(request.headers.get("authorization"));
    return json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error(JSON.stringify({ event: "webhook_cron_failure", message: error instanceof Error ? error.message : "unknown" }));
    return json({ error: "unavailable" }, { status: 503 });
  }
}
