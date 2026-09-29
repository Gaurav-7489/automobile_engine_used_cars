import { NextResponse } from "next/server";

const allowedEvents = new Set([
  "page_view",
  "inventory_search",
  "vehicle_view",
  "compare",
  "whatsapp_click",
  "call_click",
  "lead_created",
  "test_drive_requested",
  "finance_interest",
  "exchange_interest",
]);

export async function POST(request: Request) {
  const body = (await request.json()) as {
    type?: string;
    sessionId?: string;
    path?: string;
    vehicleId?: string;
    source?: string;
    campaign?: string;
  };

  if (!body.type || !allowedEvents.has(body.type) || !body.sessionId) {
    return NextResponse.json({ error: "Invalid event." }, { status: 400 });
  }

  return NextResponse.json(
    {
      accepted: true,
      event: {
        ...body,
        occurredAt: new Date().toISOString(),
      },
    },
    { status: 202 },
  );
}
