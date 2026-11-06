import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { adminAccess } from "@/lib/server/admin-gate";
import { getPrincipal } from "@/lib/server/auth";
import { AdminConsole } from "@/components/admin/admin-home";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin console | VandLabs", robots: { index: false, follow: false } };

/**
 * Platform administrators always reach the console. Without two-factor login it opens with system health, releases, tests and
 * demo data; every real dealership read and change stays behind two-factor (enforced again by each admin API).
 */
export default async function AdminPage() {
  const access = await adminAccess();
  if (!access.ok && access.reason === "signed_out") redirect("/login?returnTo=/admin");
  // Non-administrators see the same page as any unknown address.
  if (!access.ok && access.reason === "not_admin") notFound();
  if (access.ok) return <AdminConsole name={access.name} email={access.email} locked={false} />;
  const current = await getPrincipal();
  return <AdminConsole name={current?.principal.name ?? ""} email={current?.principal.email ?? ""} locked />;
}
