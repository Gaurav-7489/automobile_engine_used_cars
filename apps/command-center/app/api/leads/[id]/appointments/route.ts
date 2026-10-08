import { NextResponse } from "next/server";
import { scheduleAppointment, InputError } from "@vandlabs/data";
import { resolvePrincipal } from "../../../../../lib/auth";
import { api, objectBody } from "../../../../../lib/http";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  return api(async()=> {
    const p=await resolvePrincipal(request);const {id}=await params;const b=await objectBody(request);
    if((b.type!=="appointment"&&b.type!=="test_drive")||typeof b.scheduledAt!=="string")throw new InputError();
    return NextResponse.json(await scheduleAppointment(p,id,{type:b.type,scheduledAt:b.scheduledAt}),{status:201});
  });
}
