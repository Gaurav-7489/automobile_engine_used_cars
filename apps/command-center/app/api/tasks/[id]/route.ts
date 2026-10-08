import { NextResponse } from "next/server";
import { completeTask, InputError } from "@vandlabs/data";
import { resolvePrincipal } from "../../../../lib/auth";
import { api, objectBody } from "../../../../lib/http";
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) {
  return api(async()=>{
    const p=await resolvePrincipal(request);const {id}=await params;const b=await objectBody(request);
    if(typeof b.completed!=="boolean")throw new InputError();return NextResponse.json(await completeTask(p,id,b.completed,b.expectedVersion));
  });
}
