import { NextResponse } from "next/server";
import { patchLead, InputError } from "@vandlabs/data";
import type { LeadStage, Lead } from "@vandlabs/contracts";
import { resolvePrincipal } from "../../../../lib/auth";
import { api, objectBody } from "../../../../lib/http";
const stages:LeadStage[]=["new","contacted","qualified","appointment","visited","test_drive","negotiation","won","lost","nurture"];
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) {
  return api(async()=>{
    const principal=await resolvePrincipal(request);const {id}=await params;const body=await objectBody(request);
    const patch:Partial<Pick<Lead,"stage"|"assignedTo"|"notes">>={};
    if("stage" in body){if(!stages.includes(body.stage as LeadStage))throw new InputError();patch.stage=body.stage as LeadStage;}
    for(const [field,limit] of [["assignedTo",100],["notes",2000]] as const) {
      if(field in body){if(body[field]!==null&&typeof body[field]!=="string")throw new InputError();const value=(body[field] as string|null)?.trim();if((value?.length||0)>limit)throw new InputError();patch[field]=value||undefined;}
    }
    const result=await patchLead(principal,id,patch,body.expectedVersion);
    return NextResponse.json({...result,automation:{evaluated:result.automation.length,tasksCreated:result.automation.filter(r=>r.outcome==="created").length}});
  });
}
