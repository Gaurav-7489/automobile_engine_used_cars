import { NextResponse } from "next/server";
import { updateVehicle, InputError } from "@vandlabs/data";
import type { Vehicle } from "@vandlabs/contracts";
import { resolvePrincipal } from "../../../../lib/auth";
import { api, objectBody } from "../../../../lib/http";
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) {
  return api(async()=>{const p=await resolvePrincipal(request);const {id}=await params;const b=await objectBody(request);
    if(typeof b.price!=="number"||!Number.isFinite(b.price)||b.price<0||!["available","reserved","sold","archived"].includes(String(b.availabilityStatus))||!["draft","published","unpublished"].includes(String(b.publishStatus)))throw new InputError();
    return NextResponse.json({data:await updateVehicle(p,id,b as unknown as Pick<Vehicle,"price"|"availabilityStatus"|"publishStatus">)});
  });
}
