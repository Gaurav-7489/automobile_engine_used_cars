import { NextResponse } from "next/server";
import { discoveryLimits } from "@vandlabs/data/discovery";
import { discoveryPage, turnsFrom } from "../../../lib/discovery";

/** Read-only, cacheable pages of a search. The same deterministic engine renders /discover. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const cursor = Number(url.searchParams.get("cursor") ?? 0), limit = Number(url.searchParams.get("limit") ?? discoveryLimits.page);
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > 10000 || !Number.isInteger(limit) || limit < 1 || limit > discoveryLimits.maxPage || url.searchParams.getAll("q").length > discoveryLimits.turns)
    return NextResponse.json({ error: "Invalid search page." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const page = await discoveryPage(turnsFrom(url.searchParams.getAll("q")), cursor, limit);
    return NextResponse.json(page, { headers: { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60" } });
  } catch {
    return NextResponse.json({ error: "Search is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
