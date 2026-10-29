import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** A private platform has no public front page: the root address goes to the sign-in page, or straight to the workspace for a signed-in person. */
export default async function Home() {
  const current = await getPrincipal();
  redirect(current ? "/app/overview" : "/login");
}
