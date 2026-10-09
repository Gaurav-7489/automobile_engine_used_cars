import { NextResponse } from "next/server";
import { InputError, saveStaffMember } from "@vandlabs/data";
import { api, objectBody } from "@vandlabs/data/http";
import { authorizePlatform } from "../../../lib/auth";
export async function POST(request:Request) {
  return api(async()=>{
    const p=await authorizePlatform(request),b=await objectBody(request);
    if(typeof b.tenantId!=="string")throw new InputError();
    return NextResponse.json({data:await saveStaffMember(p,b.tenantId,b.member,b.expectedVersion)},{headers:{"Cache-Control":"private, no-store"}});
  });
}
