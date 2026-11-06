import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/support";

const PAGES: Record<string, { title: string; body: string[] }> = {
  privacy: { title: "Privacy", body: [
    "Each dealership workspace is a separate tenant. Its records are isolated at the database level, and members only see the branches they are assigned to.",
    "Sessions use secure, HttpOnly cookies. Passwords are stored only as salted hashes and are never visible to VandLabs staff or to your own administrators. Customer contact details are masked unless your role is allowed to contact leads, and they are never written to analytics events.",
    "Enquiries sent through the home page are used only to respond to the enquiry. Permission to be contacted is stored separately from marketing permission.",
    "Your service agreement with VandLabs governs retention, processing and data-subject requests.",
    `Privacy questions and data requests: ${SUPPORT_EMAIL}.`,
  ] },
  terms: { title: "Terms", body: [
    "Use of this workspace is governed by the service agreement between your dealership and VandLabs.",
    "Figures shown are calculated from records in your workspace. Where a figure needs an external source that is not connected (for example licensed market data), the product says so and shows no estimate.",
  ] },
  contact: { title: "Contact", body: [`Write to ${SUPPORT_EMAIL} to set up a dealership workspace, book a demo, share feedback or ask anything. A person reads every message.`] },
  support: { title: "Support", body: [
    "Signed-in users can open Help and shortcuts from the workspace header. For access problems, contact your workspace owner: owners can invite members and issue one-time password-reset links from Settings, Team.",
    `To set up a new workspace, report a problem, share feedback or talk with us, write to ${SUPPORT_EMAIL}.`,
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
        <div className="row-flex">
          <a className="btn btn-primary" href={supportMailto(page === "support" ? "Support request" : page === "privacy" ? "Privacy question" : "Hello VandLabs")}>Email {SUPPORT_EMAIL}</a>
          {page === "support" ? <><a className="btn" href={supportMailto("Feedback")}>Send feedback</a><a className="btn" href={supportMailto("Problem report", "What happened:\n\nWhat I expected:\n")}>Report a problem</a></> : null}
        </div>
        <Link href="/" className="accent-text">Back to home</Link>
      </main>
    </div>
  );
}
