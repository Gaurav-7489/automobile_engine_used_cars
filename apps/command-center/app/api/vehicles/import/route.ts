import { NextResponse } from "next/server";
import { requireCapability, requireDealership, requireLocation } from "@vandlabs/contracts";
import { createInventoryBatch, parseInventoryCsv, InputError } from "@vandlabs/data";
import { parseInventoryXlsx } from "@vandlabs/data/inventory-spreadsheet";
import { resolvePrincipal } from "../../../../lib/auth";
import { api, objectBody } from "../../../../lib/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return api(async () => {
    const principal = await resolvePrincipal(request); requireCapability(principal, "inventory:write");
    const body = await objectBody(request);
    if (typeof body.dealershipId !== "string" || typeof body.locationId !== "string" || !["preview", "commit"].includes(String(body.mode))) throw new InputError();
    // Deny unauthorized destinations before decompressing any uploaded workbook.
    requireDealership(principal, body.dealershipId); requireLocation(principal, body.locationId);
    const excel = Object.hasOwn(body, "xlsx"), csv = Object.hasOwn(body, "csv");
    if (excel === csv || Object.keys(body).some(k => !["dealershipId", "locationId", "mode", "xlsx", "csv", "label"].includes(k))) throw new InputError();
    const parsed = excel ? await parseInventoryXlsx(body.xlsx) : { rows: parseInventoryCsv(body.csv), worksheet: undefined };
    const format = excel ? "xlsx" : "csv";
    const data = await createInventoryBatch(principal, body.dealershipId, body.locationId, parsed.rows, { csv: true, source: format, preview: body.mode === "preview" });
    return NextResponse.json({ data: { ...data, format, worksheet: parsed.worksheet } }, { status: body.mode === "commit" ? 201 : 200 });
  });
}
