"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Brand } from "../brand";
import { Dialog } from "../overlay";
import { Button, Check, FormSummary, Notice, PasswordField, TextField } from "../ui";
import { VehicleArt } from "../vehicle-art";

type Props = { providers: { id: "google" | "microsoft"; label: string }[]; demoAccounts: { email: string; role: string; mfa: boolean }[] };

function newKey(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function LoginExperience({ providers, demoAccounts }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [mfaNeeded, setMfaNeeded] = useState(false);
  const [mfa, setMfa] = useState("");
  const [status, setStatus] = useState<"idle" | "checking">("idle");
  const [error, setError] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const live = useRef<HTMLDivElement>(null);
  const notice = params.get("notice");
  const reason = params.get("reason");
  const provider = params.get("provider") === "microsoft" ? "Microsoft" : "Google";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (status === "checking") return; // duplicate submission is disabled while authenticating
    setError("");
    if (!email.trim() || !password) { setError("Enter your business email and password."); return; }
    setStatus("checking");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, mfa: mfaNeeded ? mfa : undefined, returnTo: params.get("returnTo") ?? undefined }) });
      const body = await response.json().catch(() => ({}));
      if (response.ok) { router.replace(body.returnTo ?? "/app/overview"); router.refresh(); return; }
      if (response.status === 428) { setMfaNeeded(true); setError(""); setStatus("idle"); return; }
      setError(body?.error?.message ?? "Sign-in failed. Try again.");
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    }
    setPassword("");
    setStatus("idle");
  }

  return (
    <div className="login-shell">
      <aside className="login-brand" aria-hidden={false}>
        <Brand />
        <div className="login-copy">
          <h2 className="display">Better evidence.<br />Clearer decisions.<br />One workspace.</h2>
          <p className="lead-lg">Inventory, market comparisons and controlled execution for the dealership team.</p>
        </div>
        <div className="login-art"><VehicleArt ratio="21 / 9" /></div>
      </aside>
      <main className="login-form-wrap" id="content" tabIndex={-1}>
        <div className="login-mobile-brand"><Brand sub={false} /></div>
        <form className="login-form" onSubmit={submit} noValidate aria-describedby="login-status">
          <div><h1 className="h1" style={{ fontSize: 32, lineHeight: "40px" }}>Welcome back</h1><p className="muted" style={{ marginTop: 8 }}>Sign in to your dealership workspace.</p></div>
          {reason === "expired" ? <Notice tone="warn" role="status">Your session expired. Sign in again. Your non-sensitive setup draft was kept; no password was stored.</Notice> : null}
          {notice === "sso_unavailable" ? <Notice tone="warn" role="status">{provider} sign-in is not available in this environment yet. Use your email and password, or ask your administrator to enable it.</Notice> : null}
          {notice === "sso_unknown" ? <Notice tone="warn" role="status">That sign-in provider is not configured for this workspace.</Notice> : null}
          {error ? <FormSummary errors={{ login: error }} label="Sign-in problem" /> : null}
          <TextField label="Business email" type="email" name="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@dealership.com" disabled={mfaNeeded} />
          <PasswordField label="Password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={mfaNeeded} />
          {mfaNeeded ? <TextField label="Authenticator code" name="one-time-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfa} onChange={(e) => setMfa(e.target.value.replace(/\D/g, ""))} help="Enter the 6-digit code from your authenticator app." data-autofocus /> : null}
          <div className="spread" style={{ flexWrap: "wrap" }}>
            <Check label="Remember this device" checked={remember} onChange={setRemember} />
            <button type="button" className="link-btn" onClick={() => setForgotOpen(true)}>Forgot password?</button>
          </div>
          <Button type="submit" variant="primary" className="btn-block" loading={status === "checking"} loadingLabel="Checking credentials">{mfaNeeded ? "Verify and sign in" : "Sign in"}</Button>
          <div id="login-status" role="status" aria-live="polite" className="sr-only">{status === "checking" ? "Checking credentials" : ""}</div>
          {providers.length ? (
            <>
              <div className="login-divider"><span>Or use configured SSO</span></div>
              <div className="sso-row">{providers.map((p) => <a key={p.id} className="btn" href={`/api/auth/sso/${p.id}`}>{p.label}</a>)}</div>
            </>
          ) : null}
          <div className="stack-sm">
            <button type="button" className="link-btn" onClick={() => setAccessOpen(true)}>Need access? Request an invitation</button>
            <p className="meta">Organisation access is assigned by your administrator. MFA may be required.</p>
          </div>
        </form>
        {demoAccounts.length ? (
          <details className="demo-hint">
            <summary>Demo workspace accounts</summary>
            <p className="meta">Synthetic identities for the demonstration workspace. Password: <code>vandlabs-demo</code>. Finance asks for the code <code>424242</code>.</p>
            <ul>{demoAccounts.map((a) => <li key={a.email}><button type="button" className="link-btn" onClick={() => { setEmail(a.email); setMfaNeeded(false); }}>{a.email}</button> <span className="meta">{a.role}{a.mfa ? " / MFA" : ""}</span></li>)}</ul>
          </details>
        ) : null}
        <footer className="login-links"><Link href="/info/privacy">Privacy</Link><span aria-hidden="true">/</span><Link href="/info/terms">Terms</Link><span aria-hidden="true">/</span><Link href="/info/support">Support</Link></footer>
      </main>
      <ForgotDialog open={forgotOpen} onClose={() => setForgotOpen(false)} initialEmail={email} />
      <AccessDialog open={accessOpen} onClose={() => setAccessOpen(false)} />
      <div ref={live} className="sr-only" aria-live="polite" />
    </div>
  );
}

function ForgotDialog({ open, onClose, initialEmail }: { open: boolean; onClose: () => void; initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    await fetch("/api/auth/forgot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => undefined);
    setBusy(false);
    setSent(true);
  }
  return (
    <Dialog open={open} onClose={() => { setSent(false); onClose(); }} title="Reset your password" description="We show the same confirmation whether or not an account exists." footer={sent ? <Button variant="primary" onClick={() => { setSent(false); onClose(); }}>Done</Button> : <><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="forgot-form" loading={busy} loadingLabel="Sending">Send reset link</Button></>}>
      {sent ? <Notice tone="accent" role="status">If that address belongs to a workspace, a reset link is on its way. It expires in 30 minutes.</Notice> : (
        <form id="forgot-form" onSubmit={submit}><TextField label="Business email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-autofocus /></form>
      )}
    </Dialog>
  );
}

function AccessDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const key = useRef(newKey());
  const baseId = useId();
  const [form, setForm] = useState({ name: "", email: "", dealership: "", city: "", consent: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState("");
  const [failure, setFailure] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setFailure("");
    try {
      const response = await fetch("/api/access-requests", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key.current }, body: JSON.stringify(form) });
      const body = await response.json();
      if (response.ok) { setReference(body.reference); setErrors({}); }
      else if (body?.error?.fields) setErrors(body.error.fields);
      else setFailure(body?.error?.message ?? "Your request could not be sent.");
    } catch { setFailure("We could not reach the server. Your details are kept. Retry."); }
    setBusy(false);
  }
  return (
    <Dialog open={open} onClose={onClose} dirty={!reference && Boolean(form.name || form.email)} title={reference ? "Request received" : "Request an invitation"} description={reference ? undefined : "Submitting creates a pending request. It never creates a privileged account."}
      footer={reference ? <Button variant="primary" onClick={onClose}>Done</Button> : <><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form={`${baseId}-form`} loading={busy} loadingLabel="Sending">{failure ? "Retry" : "Send request"}</Button></>}>
      {reference ? <Notice tone="accent" role="status">Your reference is <strong>{reference}</strong>. An administrator reviews pending requests and invites approved staff.</Notice> : (
        <form id={`${baseId}-form`} className="stack" onSubmit={submit} noValidate>
          <FormSummary errors={errors} />
          {failure ? <Notice tone="danger" role="alert">{failure}</Notice> : null}
          <TextField label="Full name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} autoComplete="name" data-autofocus />
          <TextField label="Business email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} autoComplete="email" />
          <TextField label="Dealership" required value={form.dealership} onChange={(e) => setForm({ ...form, dealership: e.target.value })} error={errors.dealership} autoComplete="organization" />
          <TextField label="City" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} error={errors.city} />
          <Check label="I agree that VandLabs may contact me about this request." checked={form.consent} onChange={(v) => setForm({ ...form, consent: v })} />
          {errors.consent ? <div className="field-error" role="alert">{errors.consent}</div> : null}
        </form>
      )}
    </Dialog>
  );
}
