import { NextResponse } from "next/server";
import type { JourneyEvent } from "@vandlabs/contracts";
import { tenantConfig } from "@vandlabs/demo-data";
import { persistRuntimeJourneyEvent } from "@vandlabs/demo-data/runtime";

const allowedEvents = new Set<JourneyEvent["type"]>([
  "page_view", "inventory_search", "vehicle_view", "compare", "whatsapp_click",
  "call_click", "lead_created", "test_drive_requested", "finance_interest", "exchange_interest",
]);

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<JourneyEvent>;
  if (!body.type || !allowedEvents.has(body.type) || !body.sessionId) {
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

  if (!persistRuntimeJourneyEvent(event)) {
    return NextResponse.json({ error: "Event could not be persisted." }, { status: 503 });
  }

  return NextResponse.json({ accepted: true, event }, { status: 202 });
}
