import { NextResponse } from "next/server";
import { requestPriceChange } from "@vandlabs/data";
import { resolvePrincipal } from "../../../../lib/auth";
import { api, objectBody } from "../../../../lib/http";
export async function POST(request:Request) {
  return api(async()=>{const p=await resolvePrincipal(request),b=await objectBody(request);
    if(typeof b.vehicleId!=="string")return NextResponse.json({error:"Choose a vehicle."},{status:400});
    return NextResponse.json({data:await requestPriceChange(p,b.vehicleId,{proposedPrice:b.proposedPrice,note:b.note},b.expectedVersion)},{status:201});});
}
