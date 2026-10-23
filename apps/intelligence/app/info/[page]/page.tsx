import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";

const PAGES: Record<string, { title: string; body: string[] }> = {
  privacy: { title: "Privacy", body: [
    "Each dealership workspace is a separate tenant. Its records are isolated at the database level, and members only see the branches they are assigned to.",
    "Sessions use secure, HttpOnly cookies. Passwords are stored only as salted hashes and are never visible to VandLabs staff or to your own administrators. Customer contact details are masked unless your role is allowed to contact leads, and they are never written to analytics events.",
    "Enquiries sent through the home page are used only to respond to the enquiry. Permission to be contacted is stored separately from marketing permission.",
    "Your service agreement with VandLabs governs retention, processing and data-subject requests.",
  ] },
  terms: { title: "Terms", body: [
    "Use of this workspace is governed by the service agreement between your dealership and VandLabs.",
    "Figures shown are calculated from records in your workspace. Where a figure needs an external source that is not connected (for example licensed market data), the product says so and shows no estimate.",
  ] },
  contact: { title: "Contact", body: ["To set up a dealership workspace, use Book a demo on the home page. Requests are acknowledged with a reference ID."] },
  support: { title: "Support", body: [
    "Signed-in users can open Help and shortcuts from the workspace header. For access problems, contact your workspace owner: owners can invite members and issue one-time password-reset links from Settings, Team.",
    "To set up a new workspace or report a service problem, use Book a demo on the home page and mention the issue.",
  ] },
};

export default async function InfoPage({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  const entry = PAGES[page];
  if (!entry) notFound();
  return (
    <div className="landing" style={{ minHeight: "100dvh" }}>
      <header className="landing-header"><Brand sub={false} href="/" /><span /><Link href="/login" className="btn">Sign in</Link></header>
      <main id="content" tabIndex={-1} style={{ maxWidth: 720, display: "grid", gap: 16, paddingBlock: 48 }}>
        <h1 className="h1" id="page-title">{entry.title}</h1>
        {entry.body.map((p) => <p key={p} className="muted">{p}</p>)}
        <Link href="/" className="accent-text">Back to home</Link>
      </main>
    </div>
  );
}
