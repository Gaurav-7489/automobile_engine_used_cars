import { NextResponse } from "next/server";
import { createTask, InputError } from "@vandlabs/data";
import { resolvePrincipal } from "../../../../../lib/auth";
import { api, objectBody } from "../../../../../lib/http";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  return api(async()=>{
    const p=await resolvePrincipal(request);const {id}=await params;const b=await objectBody(request);
    if(typeof b.title!=="string"||!b.title.trim()||b.title.length>160||typeof b.owner!=="string"||!b.owner.trim()||b.owner.length>100||typeof b.dueAt!=="string"||!Number.isFinite(Date.parse(b.dueAt))||(b.priority!=="normal"&&b.priority!=="high"))throw new InputError();
    return NextResponse.json(await createTask(p,id,{title:b.title.trim(),owner:b.owner.trim(),dueAt:new Date(b.dueAt).toISOString(),priority:b.priority}),{status:201});
  });
}
