import { headers } from "next/headers";
import { staffSnapshot } from "@vandlabs/data";
import { resolvePrincipal } from "./auth";
export async function commandData() {
  const h=await headers();
  const request=new Request(process.env.APP_ORIGIN || "http://localhost:3001",{headers:h});
  return staffSnapshot(await resolvePrincipal(request));
}
