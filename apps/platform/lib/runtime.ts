import { headers } from "next/headers";
import { platformSnapshot } from "@vandlabs/data";
import { authorizePlatform } from "./auth";
export async function platformData() {
  const principal=await authorizePlatform(new Request(process.env.APP_ORIGIN||"http://localhost:3002",{headers:await headers()}));
  return platformSnapshot(principal);
}
