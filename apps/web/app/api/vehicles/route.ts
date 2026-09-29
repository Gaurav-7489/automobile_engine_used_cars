import { NextResponse } from "next/server";
import { dealershipService } from "../../../lib/services";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const body = url.searchParams.get("body");
  const fuel = url.searchParams.get("fuel");
  const vehicles = await dealershipService.inventory();

  const result = vehicles.filter((vehicle) => {
    const searchable = [
      vehicle.make,
      vehicle.model,
      vehicle.variant,
      vehicle.bodyType,
      vehicle.fuelType,
    ]
      .join(" ")
      .toLowerCase();

    return (
      (!query || searchable.includes(query)) &&
      (!body || vehicle.bodyType.toLowerCase() === body.toLowerCase()) &&
      (!fuel || vehicle.fuelType === fuel)
    );
  });

  return NextResponse.json({
    data: result,
    meta: {
      count: result.length,
      sourceOfTruth: "vehicle-repository",
    },
  });
}
