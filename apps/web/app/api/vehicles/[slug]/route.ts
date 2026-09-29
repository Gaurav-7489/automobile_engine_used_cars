import { NextResponse } from "next/server";
import { dealershipService } from "../../../../lib/services";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const vehicle = await dealershipService.vehicle(slug);

  if (!vehicle) {
    return NextResponse.json(
      { error: "Vehicle not found or not published." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    data: vehicle,
    meta: { sourceOfTruth: "vehicle-repository" },
  });
}
