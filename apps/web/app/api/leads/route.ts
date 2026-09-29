import { NextResponse } from "next/server";
import type { LeadIntent } from "@vandlabs/contracts";
import { tenantConfig, vehicles } from "@vandlabs/demo-data";
import { leadRepository } from "../../../lib/repositories";

const validIntents: LeadIntent[] = [
  "enquiry",
  "test_drive",
  "finance",
  "exchange",
];

export async function POST(request: Request) {
  const body = (await request.json()) as {
    name?: string;
    phone?: string;
    email?: string;
    intent?: LeadIntent;
    vehicleId?: string;
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
  const vehicle = body.vehicleId
    ? vehicles.find((item) => item.id === body.vehicleId)
    : undefined;
  const lastTouch = body.attribution?.lastTouch;
  const firstTouch = body.attribution?.firstTouch;

  const lead = await leadRepository.create({
    tenantId: tenantConfig.tenantId,
    dealershipId: tenantConfig.activeDealershipId,
    locationId: vehicle?.locationId,
    vehicleId: vehicle?.id,
    vehicleIds: vehicle ? [vehicle.id] : [],
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
      vehicleInterestHistory: vehicle ? [vehicle.id] : [],
    },
  });

  return NextResponse.json(
    {
      leadId: lead.id,
      stage: lead.stage,
      vehicleId: lead.vehicleId,
      message: "Demo lead accepted through the VandLabs BFF contract.",
    },
    { status: 201 },
  );
}
