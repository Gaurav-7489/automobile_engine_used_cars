import Link from "next/link";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";

const PAGES: Record<string, { title: string; body: string[] }> = {
  privacy: { title: "Privacy", body: ["Demo requests and access requests are used only to respond to the request. Consent to be contacted is stored separately from marketing permission.", "Session tokens live in secure HttpOnly cookies. Contact details are masked by role inside the workspace and are never written to analytics events.", "The final privacy notice is issued by VandLabs before any commercial launch."] },
  terms: { title: "Terms", body: ["This workspace presents illustrative data and a design proposal. It does not establish live integrations, verified data coverage or completed platform transactions.", "Feature scope and commercial terms are subject to written approval."] },
  contact: { title: "Contact", body: ["To discuss a pilot, use Book a demo on the home page. Requests are acknowledged with a reference ID."] },
  support: { title: "Support", body: ["Signed-in users can open Help and shortcuts from the workspace header. For access problems, contact your workspace administrator."] },
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
