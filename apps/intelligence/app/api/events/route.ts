import { currentSession, json, problem, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["search_submitted", "listing_opened", "scenario_saved", "price_request_submitted", "price_applied", "campaign_published", "lead_action_logged", "alert_resolved", "export_requested", "report_viewed", "export_ready"]);

/** Analytics events are tenant/branch scoped and carry IDs and outcomes only: no secrets or raw contact values. */
export async function POST(request: Request) {
  const session = await currentSession();
  if (!session) return problem(401, "unauthenticated", "Sign in to continue.");
  const body = await readJson<{ name?: string; branch?: string; properties?: Record<string, string | number | boolean> }>(request, 4000);
  if (!body?.name || !ALLOWED.has(body.name)) return problem(422, "invalid", "Unknown event.");
  const safe = Object.fromEntries(Object.entries(body.properties ?? {}).filter(([key, value]) => !/(phone|email|contact|secret|token|password)/i.test(key) && (typeof value !== "string" || value.length <= 80)));
  console.info(JSON.stringify({ event: body.name, branch: body.branch ?? null, user: session.sub, properties: safe }));
  return json({ ok: true }, { status: 202 });
}
