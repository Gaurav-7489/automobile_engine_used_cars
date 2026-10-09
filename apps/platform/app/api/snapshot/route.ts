import { NextResponse } from "next/server";
import { platformSnapshot, runtimeReadiness } from "@vandlabs/data";
import { authorizePlatform } from "../../../lib/auth";
import { api } from "@vandlabs/data/http";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
  return api(async()=>NextResponse.json({data:await platformSnapshot(await authorizePlatform(request)),readiness:runtimeReadiness("platform")},{headers:{"Cache-Control":"private, no-store"}}));
}
