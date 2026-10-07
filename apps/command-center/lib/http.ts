import { NextResponse } from "next/server";
import { InputError, RecordNotFound } from "@vandlabs/data";
import { accessError } from "@vandlabs/server-auth";
export async function api(action:()=>Promise<Response>) {
  try {return await action();} catch(error) {
    const auth=accessError(error); if(auth)return NextResponse.json({error:auth.message},{status:auth.status});
    if(error instanceof InputError || error instanceof SyntaxError)return NextResponse.json({error:"Invalid request."},{status:400});
    if(error instanceof RecordNotFound)return NextResponse.json({error:"Record not found."},{status:404});
    return NextResponse.json({error:"Service unavailable."},{status:503});
  }
}
export async function objectBody(request:Request):Promise<Record<string,unknown>> {
  const value=await request.json();if(!value||typeof value!=="object"||Array.isArray(value))throw new InputError();return value;
}
