import { NextResponse } from "next/server";
import type { LeadIntent, AttributionTouch } from "@vandlabs/contracts";
import { tenantConfig, createLead, publicInventory, InputError } from "@vandlabs/data";

import { limitPublicRequest, publicOriginFailure, publicJson } from "../../../lib/public-request";
import { isReadOnlyPreview } from "../../../lib/hosting";

const validIntents: LeadIntent[] = [
  "enquiry",
  "test_drive",
  "finance",
  "exchange",
];

export async function POST(request: Request) {
  if (isReadOnlyPreview()) return NextResponse.json({error:"This browsing preview does not accept enquiries or record activity. A shared backend must be configured."}, {status:503});
  const originFailure = publicOriginFailure(request); if (originFailure) return originFailure;
  const limited = await limitPublicRequest(request, tenantConfig.tenantId + ":leads", 12); if (limited) return limited;
  try {
  const body = (await publicJson(request)) as {
    name?: string;
    phone?: string;
    email?: string;
    intent?: LeadIntent;
    vehicleId?: string;
    vehicleIds?: string[];
    notes?: string;
    whatsappConsent?: boolean;
    marketingConsent?: boolean;
    attribution?: {
      firstTouch?: {
        source?: string;
        medium?: string;
        campaign?: string;
        landingPath?: string;
        capturedAt?: string;
      };
      lastTouch?: {
        source?: string;
        medium?: string;
        campaign?: string;
        landingPath?: string;
        capturedAt?: string;
      };
    };
  };

  if (!body || typeof body !== "object" || Array.isArray(body) ||
    typeof body.name !== "string" || body.name.length > 120 ||
    typeof body.phone !== "string" || body.phone.length > 32 ||
    (body.email !== undefined && (typeof body.email !== "string" || body.email.length > 254)) ||
    (body.notes !== undefined && (typeof body.notes !== "string" || body.notes.length > 2000)) ||
    (body.vehicleId !== undefined && (typeof body.vehicleId !== "string" || body.vehicleId.length > 100)) ||
    (body.vehicleIds !== undefined && (!Array.isArray(body.vehicleIds) || body.vehicleIds.length > 3 || body.vehicleIds.some(id => typeof id !== "string" || id.length > 100))) ||
    (body.whatsappConsent !== undefined && typeof body.whatsappConsent !== "boolean") ||
    (body.marketingConsent !== undefined && typeof body.marketingConsent !== "boolean")) {
    return NextResponse.json({error:"Invalid enquiry."},{status:400});
  }
  const name = body.name?.trim();
  const phone = body.phone?.trim();
  if (!name || !phone) {
    return NextResponse.json(
      { error: "Name and phone are required." },
      { status: 400 },
    );
  }

  const intent =
    body.intent && validIntents.includes(body.intent)
      ? body.intent
      : "enquiry";
  const vehicles = await publicInventory();
  const vehicle = body.vehicleId
    ? vehicles.find((item) => item.id === body.vehicleId)
    : undefined;
  const interestIds = [...new Set([...(body.vehicleId ? [body.vehicleId] : []), ...(body.vehicleIds ?? [])])];
  if (interestIds.length > 3 || interestIds.some(id => !vehicles.some(item => item.id === id))) return NextResponse.json({error:"Invalid vehicle shortlist."}, {status:400});
  const cleanTouch = (touch?: Partial<AttributionTouch>) => {
    if (!touch || typeof touch.source !== "string" || touch.source.length > 100 ||
      typeof touch.landingPath !== "string" || touch.landingPath.length > 1000 ||
      typeof touch.capturedAt !== "string" || !Number.isFinite(Date.parse(touch.capturedAt))) return undefined;
    return {source:touch.source, landingPath:touch.landingPath, capturedAt:touch.capturedAt, campaign: typeof touch.campaign === "string" ? touch.campaign.slice(0,200) : undefined, medium: typeof touch.medium === "string" ? touch.medium.slice(0,100) : undefined};
  };
  const lastTouch = cleanTouch(body.attribution?.lastTouch);
  const firstTouch = cleanTouch(body.attribution?.firstTouch);

  if (body.vehicleId && (!vehicle || vehicle.availabilityStatus !== "available")) return NextResponse.json({ error: "Vehicle is unavailable." }, {status:400});

  const { lead, automation } = await createLead({
    tenantId: tenantConfig.tenantId,
    dealershipId: tenantConfig.activeDealershipId,
    locationId: vehicle?.locationId ?? tenantConfig.organization.dealerships.find(d=>d.id===tenantConfig.activeDealershipId)?.locations[0]?.id,
    vehicleId: vehicle?.id,
    vehicleIds: interestIds,
    name,
    phone,
    email: body.email?.trim() || undefined,
    channel: "web",
    intent,
    source: lastTouch?.source || firstTouch?.source || "direct",
    campaign: lastTouch?.campaign || firstTouch?.campaign,
    notes: body.notes?.trim() || undefined,
    consent: {
      whatsapp: Boolean(body.whatsappConsent),
      marketing: Boolean(body.marketingConsent),
    },
    journey: {
      firstTouch:
        firstTouch?.source && firstTouch.landingPath && firstTouch.capturedAt
          ? {
              source: firstTouch.source,
              medium: firstTouch.medium,
              campaign: firstTouch.campaign,
              landingPath: firstTouch.landingPath,
              capturedAt: firstTouch.capturedAt,
            }
          : undefined,
      lastTouch:
        lastTouch?.source && lastTouch.landingPath && lastTouch.capturedAt
          ? {
              source: lastTouch.source,
              medium: lastTouch.medium,
              campaign: lastTouch.campaign,
              landingPath: lastTouch.landingPath,
              capturedAt: lastTouch.capturedAt,
            }
          : undefined,
      vehicleInterestHistory: interestIds,
    },
  });


  return NextResponse.json(
    {
      leadId: lead.id,
      stage: lead.stage,
      vehicleId: lead.vehicleId,
      vehicleIds: lead.vehicleIds,
      message: "Your enquiry has been received.",
      automation: {
        evaluated: automation.length,
        tasksCreated: automation.filter((run) => run.outcome === "created").length,
      },
    },
    { status: 201, headers: {"Cache-Control":"no-store"} },
  );
  } catch(error) {
    if(error instanceof SyntaxError||error instanceof InputError)return NextResponse.json({error:"Invalid enquiry."},{status:400});
    return NextResponse.json({error:"Enquiry service unavailable. Please retry or contact the dealership."},{status:503});
  }

}
