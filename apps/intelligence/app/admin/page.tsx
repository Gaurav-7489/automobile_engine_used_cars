import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { adminAccess } from "@/lib/server/admin-gate";
import { AdminConsole } from "@/components/admin/admin-console";
import { Brand } from "@/components/brand";

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
          <h1 className="h1">Turn on two-factor login first</h1>
          <p className="muted">The admin console can see and change every dealership, so it needs two-factor login on your account. It takes about a minute with an authenticator app.</p>
          <div className="row-flex"><Link className="btn btn-primary" href="/app/settings/security">Open Security settings</Link><Link className="btn" href="/app/overview">Back to my workspace</Link></div>
        </div>
      </main>
    );
  }
  return <AdminConsole name={access.name} email={access.email} />;
}
