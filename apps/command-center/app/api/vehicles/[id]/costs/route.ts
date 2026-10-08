import { NextResponse } from "next/server";
import { saveStockCost } from "@vandlabs/data";
import { resolvePrincipal } from "../../../../../lib/auth";
import { api, objectBody } from "../../../../../lib/http";
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}) {
  return api(async()=>{const p=await resolvePrincipal(request),b=await objectBody(request),{id}=await params;return NextResponse.json({data:await saveStockCost(p,id,b.record,b.expectedVersion)});});
}
