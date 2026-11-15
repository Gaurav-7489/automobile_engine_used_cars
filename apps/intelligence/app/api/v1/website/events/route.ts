import { json, problem } from "@/lib/api";
import { parseEvents, recordEvents } from "@/lib/server/website-analytics";
import { jsonBody, websiteCaller } from "@/lib/server/website-auth";

export const dynamic = "force-dynamic";

/** Website analytics batch from a connected website's server (at most 20 events). Only daily counts are stored. */
export async function POST(request: Request) {
  const gate = await websiteCaller(request, { perKeyPerMinute: 600 });
  if ("response" in gate) return gate.response;
  const parsed = await jsonBody(request, 8_000);
  if ("response" in parsed) return parsed.response;
  try {
    const counted = await recordEvents(gate.caller.tenantId, parseEvents(parsed.body));
    return json({ ok: true, counted }, { status: 202 });
  } catch (error) {
    console.error(JSON.stringify({ event: "website_events_failure", message: error instanceof Error ? error.message : "unknown" }));
    return problem(503, "unavailable", "Events could not be recorded just now.");
  }
}
