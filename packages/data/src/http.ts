import { NextResponse } from "next/server";
import { InputError, RecordNotFound, ConflictError, InventoryValidationError } from "./errors";
import { accessError } from "@vandlabs/server-auth";
export async function api(action:()=>Promise<Response>) {
  const headers={"Cache-Control":"private, no-store"};
  try {const response=await action();response.headers.set("Cache-Control",headers["Cache-Control"]);return response;} catch(error) {
    const auth=accessError(error); if(auth)return NextResponse.json({error:auth.message},{status:auth.status,headers});
    if(error instanceof InventoryValidationError)return NextResponse.json({error:error.message,issues:error.issues},{status:400,headers});
    if(error instanceof InputError || error instanceof SyntaxError)return NextResponse.json({error:"Invalid request."},{status:400,headers});
    if(error instanceof ConflictError)return NextResponse.json({error:error.message},{status:409,headers});
    if(error instanceof RecordNotFound)return NextResponse.json({error:"Record not found."},{status:404,headers});
    return NextResponse.json({error:"Service unavailable."},{status:503,headers});
  }
}
export async function objectBody(request:Request):Promise<Record<string,unknown>> {
  if(!request.body)throw new InputError();
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try {while(true){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>1000000){await reader.cancel();throw new InputError("Request exceeds 1 MB.");}chunks.push(item.value);}}
  finally {reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const value:unknown=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=="object"||Array.isArray(value))throw new InputError();return value as Record<string,unknown>;
}
