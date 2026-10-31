import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { adminAccess } from "@/lib/server/admin-gate";
import { AdminConsole } from "@/components/admin/admin-console";
import { Brand } from "@/components/brand";
import { AdminTwoFactorGate } from "@/components/admin/two-factor-gate";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin console | VandLabs", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const access = await adminAccess();
  if (!access.ok && access.reason === "signed_out") redirect("/login?returnTo=/admin");
  // Non-administrators see the same page as any unknown address.
  if (!access.ok && access.reason === "not_admin") notFound();
  if (!access.ok) {
    return (
      <main className="login-form-wrap" id="content" tabIndex={-1}>
        <div className="login-form stack">
          <Brand sub={false} />
          <h1 className="h1">One step before the admin console</h1>
          <p className="muted">The admin console can change every dealership, so your account needs two-factor login. Set it up here with any authenticator app; the console opens as soon as it is on. You only do this once.</p>
          <AdminTwoFactorGate />
          <div><Link className="btn btn-ghost" href="/app/overview">Back to my workspace</Link></div>
        </div>
      </main>
    );
  }
  return <AdminConsole name={access.name} email={access.email} />;
}
