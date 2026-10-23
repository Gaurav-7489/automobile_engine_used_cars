"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Brand } from "../brand";
import { Icon } from "../icons";
import { Dialog } from "../overlay";
import { Button, Check, FormSummary, Kpi, Notice, TextField } from "../ui";

const PLANS = [
  { name: "Starter", blurb: "Establish stock operations" },
  { name: "Growth", blurb: "Add intelligence and workflows" },
  { name: "Enterprise", blurb: "Configure access and integrations" },
] as const;

const CAPABILITIES = [
  { title: "Market evidence", body: "Compare licensed listings with visible source age and cohort definitions." },
  { title: "Inventory operations", body: "One stock record, traceable costs and controlled asking-price changes." },
  { title: "Vehicle-specific advertising", body: "Link creative, budget and measurable enquiries to an available vehicle." },
] as const;

type Draft = { name: string; email: string; dealership: string; city: string; phone: string; consent: boolean; marketing: boolean };
const EMPTY: Draft = { name: "", email: "", dealership: "", city: "", phone: "", consent: false, marketing: false };

function newKey(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Scroll to a named section and move focus to its heading. */
function jump(id: string) {
  const heading = document.getElementById(id);
  if (!heading) return;
  heading.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  window.setTimeout(() => heading.focus({ preventScroll: true }), 150);
}

export function LandingPage() {
  const [demoOpen, setDemoOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);
  // The draft lives here, so closing the dialog preserves it; a successful submission clears it.
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [reference, setReference] = useState("");
  const keyRef = useRef<string>("");

  const openDemo = (selected: string | null = null) => {
    setPlan(selected);
    setReference("");
    setFailure("");
    if (!keyRef.current) keyRef.current = newKey();
    setDemoOpen(true);
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailure("");
    try {
      const response = await fetch("/api/demo-requests", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": keyRef.current }, body: JSON.stringify({ ...draft, plan }) });
      const body = await response.json().catch(() => ({}));
      if (response.ok) { setReference(body.reference); setDraft(EMPTY); setErrors({}); keyRef.current = ""; }
      else if (body?.error?.fields) { setErrors(body.error.fields); keyRef.current = keyRef.current || newKey(); }
      else setFailure(body?.error?.message ?? "Your request could not be sent. Your details are kept.");
    } catch {
      setFailure("We could not reach the server. Your details are kept: retry when you are back online.");
    }
    setBusy(false);
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => { setDraft((d) => ({ ...d, [key]: value })); setErrors((e) => { const next = { ...e }; delete next[key as string]; return next; }); };

  return (
    <div className="landing">
      <header className="landing-header">
        <Brand sub={false} href="/" />
        <nav className="landing-nav" aria-label="Sections">
          <a href="#capabilities" onClick={(e) => { e.preventDefault(); jump("capabilities-heading"); }}>Product</a>
          <a href="#solutions" onClick={(e) => { e.preventDefault(); jump("capabilities-heading"); }}>Solutions</a>
          <a href="#workflow" onClick={(e) => { e.preventDefault(); jump("capabilities-heading"); }}>Workflow</a>
          <a href="#pricing" onClick={(e) => { e.preventDefault(); jump("plans-heading"); }}>Pricing</a>
        </nav>
        <div className="landing-actions">
          <Link href="/login" className="btn">Sign in</Link>
          <Button variant="primary" onClick={() => openDemo()}>Book a demo</Button>
        </div>
        <button type="button" className="btn btn-ghost accent-text landing-menu-btn" onClick={() => setMenuOpen(true)} aria-haspopup="dialog">Menu</button>
      </header>

      <main id="content" tabIndex={-1}>
        <section className="landing-hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">Intelligence for Indian dealerships</p>
            <h1 className="display" id="hero-title">Know your stock.<br className="hide-sm" /> Understand the market.<br className="hide-sm" /> Decide with evidence.</h1>
            <p className="lead-lg hero-lead">Market evidence, inventory operations and vehicle-specific advertising in one dealership workspace.</p>
            <div className="hero-buttons">
              <Button variant="primary" onClick={() => openDemo()}>Book a demo</Button>
              <Button onClick={() => jump("capabilities-heading")}>Explore product</Button>
            </div>
          </div>
          <aside className="hero-preview card" aria-label="What the workspace shows">
            <div className="spread" style={{ alignItems: "flex-start" }}>
              <h2 className="h3">A clear view of every decision</h2>
            </div>
            <div className="preview-kpis">
              <Kpi label="Available stock" value="—" note="Counted from your inventory" />
              <Kpi label="Gross at asking" value="—" note="Estimate once costs are recorded" />
            </div>
            <p className="muted">Every figure is calculated from your own records. Where evidence is missing, the workspace says so instead of estimating.</p>
          </aside>
        </section>

        <section className="landing-capabilities" aria-labelledby="capabilities-heading" id="capabilities" data-anchors="solutions workflow">
          <h2 className="sr-only" id="capabilities-heading" tabIndex={-1}>Capabilities</h2>
          {CAPABILITIES.map((c) => <article className="card cap-card" key={c.title}><h3 className="h3">{c.title}</h3><p className="muted">{c.body}</p></article>)}
        </section>

        <section className="landing-plans" aria-labelledby="plans-heading" id="pricing">
          <h2 className="h1" id="plans-heading" tabIndex={-1}>An operating model built around your dealership</h2>
          <div className="plan-grid">
            {PLANS.map((p) => (
              <article className="card plan-card" key={p.name}>
                <h3 className="h2">{p.name}</h3>
                <p className="muted">{p.blurb}</p>
                <button type="button" className="link-btn" onClick={() => openDemo(p.name)} aria-label={`Discuss ${p.name} plan`}>Discuss plan &gt;</button>
              </article>
            ))}
          </div>
          <p className="meta">Pricing is not published. No checkout is available before commercial terms are published.</p>
        </section>
      </main>

      <footer className="landing-footer">
        <nav aria-label="Footer"><span>VandLabs</span><span aria-hidden="true">/</span><Link href="/info/privacy">Privacy</Link><span aria-hidden="true">/</span><Link href="/info/terms">Terms</Link><span aria-hidden="true">/</span><Link href="/info/contact">Contact</Link></nav>
        <span>Feature scope and commercial terms subject to approval</span>
      </footer>

      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu" size="w480">
        <nav className="stack-sm" aria-label="Mobile sections">
          {[["Product", "capabilities-heading"], ["Solutions", "capabilities-heading"], ["Workflow", "capabilities-heading"], ["Pricing", "plans-heading"]].map(([label, id]) => (
            <button key={label} type="button" className="nav-link" style={{ fontSize: 16, background: "none", border: 0, textAlign: "left" }} onClick={() => { setMenuOpen(false); window.setTimeout(() => jump(id), 200); }}>{label}</button>
          ))}
        </nav>
        <Link href="/login" className="btn">Sign in</Link>
      </Dialog>

      <Dialog open={demoOpen} onClose={() => setDemoOpen(false)} size="w480" dirty={false} title={reference ? "Request received" : "Book a demo"}
        description={reference ? undefined : plan ? `Plan context: ${plan}. We use this to prepare the conversation. There is no checkout.` : "Tell us about your dealership and we will arrange a walkthrough."}
        footer={reference ? <Button variant="primary" onClick={() => setDemoOpen(false)}>Done</Button> : <><Button onClick={() => setDemoOpen(false)}>Close</Button><Button variant="primary" type="submit" form="demo-form" loading={busy} loadingLabel="Sending">{failure ? "Retry" : "Request demo"}</Button></>}>
        {reference ? (
          <div className="stack" role="status">
            <Notice tone="accent">Request received. Your reference is <strong>{reference}</strong>. Quote it if you contact us.</Notice>
            <p className="muted">A VandLabs specialist will contact you on the details you gave.</p>
          </div>
        ) : (
          <form id="demo-form" className="stack" onSubmit={submit} noValidate>
            <FormSummary errors={errors} />
            {failure ? <Notice tone="danger" role="alert">{failure}</Notice> : null}
            <TextField label="Full name" required autoComplete="name" value={draft.name} onChange={(e) => set("name", e.target.value)} error={errors.name} data-autofocus />
            <TextField label="Business email" type="email" required autoComplete="email" value={draft.email} onChange={(e) => set("email", e.target.value)} error={errors.email} />
            <TextField label="Dealership" required autoComplete="organization" value={draft.dealership} onChange={(e) => set("dealership", e.target.value)} error={errors.dealership} />
            <TextField label="City" required value={draft.city} onChange={(e) => set("city", e.target.value)} error={errors.city} />
            <TextField label="Phone" type="tel" required autoComplete="tel" inputMode="tel" value={draft.phone} onChange={(e) => set("phone", e.target.value)} error={errors.phone} help="So we can confirm a time." />
            <Check label="I agree that VandLabs may contact me about this demo request." checked={draft.consent} onChange={(v) => set("consent", v)} />
            {errors.consent ? <div className="field-error" role="alert">{errors.consent}</div> : null}
            <Check label="Optional: send me product news. This is separate from the demo request." checked={draft.marketing} onChange={(v) => set("marketing", v)} />
          </form>
        )}
      </Dialog>
    </div>
  );
}

export { Icon };
