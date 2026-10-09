import { NextResponse } from "next/server";
import type { JourneyEvent } from "@vandlabs/contracts";
import { tenantConfig, saveEvent } from "@vandlabs/data";

import { limitPublicRequest, publicOriginFailure, publicJson } from "../../../lib/public-request";
import { isReadOnlyPreview } from "../../../lib/hosting";

const allowedEvents = new Set<JourneyEvent["type"]>([
  "page_view", "inventory_search", "vehicle_view", "compare", "whatsapp_click",
  "call_click", "lead_created", "test_drive_requested", "finance_interest", "exchange_interest",
]);

export async function POST(request: Request) {
  if (isReadOnlyPreview()) return NextResponse.json({error:"This browsing preview does not accept enquiries or record activity. A shared backend must be configured."}, {status:503});
  const originFailure = publicOriginFailure(request); if (originFailure) return originFailure;
  const limited = await limitPublicRequest(request, tenantConfig.tenantId + ":events", 240); if (limited) return limited;
  try {
  const body = (await publicJson(request, 8192)) as Partial<JourneyEvent>;
  if (!body.type || !allowedEvents.has(body.type) || typeof body.sessionId !== "string" || body.sessionId.length < 1 || body.sessionId.length > 100 ||
    [body.vehicleId, body.source, body.campaign, body.path].some(value => value !== undefined && (typeof value !== "string" || value.length > 1000))) {
    return NextResponse.json({ error: "Invalid event." }, { status: 400 });
  }

  const event: JourneyEvent = {
    id: crypto.randomUUID(),
    tenantId: tenantConfig.tenantId,
    sessionId: body.sessionId,
    type: body.type,
    vehicleId: body.vehicleId,
    source: body.source,
    campaign: body.campaign,
    path: body.path || "/",
    occurredAt: new Date().toISOString(),
  };

  await saveEvent(event);

  return NextResponse.json({ accepted: true, event }, { status: 202, headers: {"Cache-Control":"no-store"} });
  } catch (error) {
    return NextResponse.json({error: error instanceof SyntaxError ? "Invalid event." : "Event service unavailable."}, {status:error instanceof SyntaxError ? 400 : 503,headers:{"Cache-Control":"no-store"}});
  }
}
