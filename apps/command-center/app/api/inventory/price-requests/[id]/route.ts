import { NextResponse } from "next/server";
import { decidePriceChange } from "@vandlabs/data";
import { resolvePrincipal } from "../../../../../lib/auth";
import { api, objectBody } from "../../../../../lib/http";
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) {
  return api(async()=>{const p=await resolvePrincipal(request),b=await objectBody(request),{id}=await params;
    const decided=await decidePriceChange(p,id,b);
    // A stale approval is recorded (so the request is closed) but reported as a conflict: nothing was applied.
    return NextResponse.json({data:decided},{status:decided.status==="stale"?409:200});});
}
