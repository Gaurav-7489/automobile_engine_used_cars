import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ACCESS_COOKIE, accessRequestStatus, readAccessCookie } from "@/lib/server/access-requests";
import { RequestAccess } from "@/components/login/request-access";

export const metadata: Metadata = { title: "Request access", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Reached only from the Google callback when a verified Google account has no access yet. */
export default async function RequestAccessPage() {
  const identity = await readAccessCookie((await cookies()).get(ACCESS_COOKIE)?.value);
  const status = identity ? await accessRequestStatus(identity.sub).catch(() => null) : null;
  return <RequestAccess identity={identity ? { email: identity.email, name: identity.name } : null} status={status} />;
}
