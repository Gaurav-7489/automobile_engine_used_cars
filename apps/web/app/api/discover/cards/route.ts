import { NextResponse } from "next/server";
import { dealershipService } from "../../../../lib/services";
import { reelCard } from "../../../../lib/discovery";

/** Public cards for cars saved in this browser. Unknown or unpublished ids are simply omitted. */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = [...new Set(raw.slice(0, 3000).split(",").map(id => id.trim()).filter(id => id && id.length <= 100))].slice(0, 30);
  try {
    const inventory = await dealershipService.inventory();
    const cards = ids.map(id => inventory.find(vehicle => vehicle.id === id)).filter(vehicle => vehicle !== undefined).map(reelCard);
    return NextResponse.json({ cards }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=30" } });
  } catch {
    return NextResponse.json({ error: "Saved cars are temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
