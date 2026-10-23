import { json } from "@/lib/api";
import { plain } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/** Liveness plus a database round trip. Reports no configuration or schema detail. */
export async function GET() {
  const started = Date.now();
  try {
    await plain((c) => c.query("SELECT 1 AS ok"));
    return json({ status: "ok", service: "vandlabs-intelligence", database: "ok", latency_ms: Date.now() - started });
  } catch {
    return json({ status: "degraded", service: "vandlabs-intelligence", database: "unavailable" }, { status: 503 });
  }
}
