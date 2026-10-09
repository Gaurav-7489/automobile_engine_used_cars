import { NextResponse } from "next/server";
import { platformSnapshot, runtimeReadiness } from "@vandlabs/data";
import { authorizePlatform } from "../../../lib/auth";
import { api } from "@vandlabs/data/http";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  return api(async()=>{
    const p=await authorizePlatform(request),configuration=runtimeReadiness("platform");
    let database:{ready:boolean;detail:string};
    try{await platformSnapshot(p);database={ready:process.env.DATA_MODE==="aurora",detail:process.env.DATA_MODE==="aurora"?"Tenant-isolated reads and required platform tables verified":"Local reference records only"};}
    catch{database={ready:false,detail:"Connection, migration, role grants or tenant provisioning require attention"};}
    return NextResponse.json({...configuration,database,ready:configuration.ready&&database.ready},{status:configuration.ready&&database.ready?200:503,headers:{"Cache-Control":"private, no-store"}});
  });
}
