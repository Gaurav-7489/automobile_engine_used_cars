import { NextResponse } from "next/server";
import { staffSnapshot, runtimeReadiness } from "@vandlabs/data";
import { api } from "../../../lib/http";
import { resolvePrincipal } from "../../../lib/auth";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  return api(async()=>{
    const p=await resolvePrincipal(request),configuration=runtimeReadiness("command");
    let database:{ready:boolean;detail:string};
    try{await staffSnapshot(p);database={ready:process.env.DATA_MODE==="aurora",detail:process.env.DATA_MODE==="aurora"?"Tenant-isolated operational reads verified":"Local reference records only"};}
    catch{database={ready:false,detail:"Connection, migration, role grants or tenant provisioning require attention"};}
    return NextResponse.json({...configuration,database,ready:configuration.ready&&database.ready},{status:configuration.ready&&database.ready?200:503,headers:{"Cache-Control":"private, no-store"}});
  });
}
