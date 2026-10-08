import { NextResponse } from "next/server";
import { requireCapability } from "@vandlabs/contracts";
import { createInventoryBatch, parseInventoryCsv, InputError } from "@vandlabs/data";
import { resolvePrincipal } from "../../../../lib/auth";
import { api, objectBody } from "../../../../lib/http";
export async function POST(request:Request) {
  return api(async()=> {
    const p=await resolvePrincipal(request);requireCapability(p,"inventory:write");
    const b=await objectBody(request);
    if(typeof b.dealershipId!=="string"||typeof b.locationId!=="string"||!["preview","commit"].includes(String(b.mode)))throw new InputError();
    const data=await createInventoryBatch(p,b.dealershipId,b.locationId,parseInventoryCsv(b.csv),{csv:true,preview:b.mode==="preview"});
    return NextResponse.json({data},{status:b.mode==="commit"?201:200});
  });
}
