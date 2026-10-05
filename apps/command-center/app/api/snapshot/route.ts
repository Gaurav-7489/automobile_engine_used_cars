import { NextResponse } from "next/server";
import { staffSnapshot, metrics } from "@vandlabs/data";
import { resolvePrincipal } from "../../../lib/auth";
import { api } from "../../../lib/http";
export async function GET(request:Request) {
  return api(async()=>{const principal=await resolvePrincipal(request);const data=await staffSnapshot(principal);
    return NextResponse.json({data,metrics:metrics(data),principal},{headers:{"Cache-Control":"private, no-store"}});});
}
