import { NextResponse } from "next/server";
import { confirmSale, InputError } from "@vandlabs/data";
import { resolvePrincipal } from "../../../../../lib/auth";
import { api, objectBody } from "../../../../../lib/http";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  return api(async()=> {
    const p=await resolvePrincipal(request);const {id}=await params;const b=await objectBody(request);
    if(typeof b.amount!=="number"||typeof b.soldAt!=="string")throw new InputError();
    return NextResponse.json(await confirmSale(p,id,{amount:b.amount,soldAt:b.soldAt}),{status:201});
  });
}
