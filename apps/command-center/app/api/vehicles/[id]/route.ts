import { NextResponse } from "next/server";
import { updateVehicle, InputError } from "@vandlabs/data";
import type { Vehicle } from "@vandlabs/contracts";
import { resolvePrincipal } from "../../../../lib/auth";
import { api, objectBody } from "../../../../lib/http";
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) {
  return api(async()=>{const p=await resolvePrincipal(request);const {id}=await params;const b=await objectBody(request);
    if(typeof b.price!=="number"||!Number.isFinite(b.price)||b.price<0||!["available","reserved","sold"].includes(String(b.availabilityStatus))||!["draft","published","archived"].includes(String(b.publishStatus)))throw new InputError();
    return NextResponse.json({data:await updateVehicle(p,id,{price:b.price,availabilityStatus:b.availabilityStatus as Vehicle["availabilityStatus"],publishStatus:b.publishStatus as Vehicle["publishStatus"]})});
  });
}
