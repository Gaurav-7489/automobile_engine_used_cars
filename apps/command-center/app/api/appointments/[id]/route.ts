import { NextResponse } from "next/server";
import { setAppointmentStatus, InputError } from "@vandlabs/data";
import type { Appointment } from "@vandlabs/contracts";
import { resolvePrincipal } from "../../../../lib/auth";
import { api, objectBody } from "../../../../lib/http";
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) {
  return api(async()=> {
    const p=await resolvePrincipal(request);const {id}=await params;const b=await objectBody(request);
    if(typeof b.status!=="string")throw new InputError();
    return NextResponse.json(await setAppointmentStatus(p,id,b.status as Appointment["status"]));
  });
}
