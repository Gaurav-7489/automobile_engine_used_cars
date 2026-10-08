import { NextResponse } from "next/server";
import { createInventoryBatch, InputError } from "@vandlabs/data";
import { resolvePrincipal } from "../../../lib/auth";
import { api, objectBody } from "../../../lib/http";
export async function POST(request:Request) {
  return api(async()=> {
    const p=await resolvePrincipal(request),b=await objectBody(request);
    if(typeof b.dealershipId!=="string"||typeof b.locationId!=="string")throw new InputError();
    return NextResponse.json({data:await createInventoryBatch(p,b.dealershipId,b.locationId,[b.vehicle])},{status:201});
  });
}
