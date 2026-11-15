"use client";
import { clearRemoteCache } from "@/lib/remote-cache";

import { ThemeSwitch, ThemeToggle } from "../theme";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import { Brand } from "../brand";
import { Dialog } from "../overlay";
import { Button, FormSummary, Notice, PasswordField, TextField } from "../ui";
import { LoginBand, LoginCinema } from "./login-cinema";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/support";

type Props = { providers: { id: "google" | "microsoft"; label: string }[]; legacy?: boolean };


export function LoginExperience({ providers, legacy = false }: Props) {
  const router = useRouter();
  // A new sign-in never sees data cached for whoever used this tab before.
  useEffect(() => { clearRemoteCache(); }, []);
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [status, setStatus] = useState<"idle" | "checking">("idle");
  const [error, setError] = useState("");
  const [accessOpen, setAccessOpen] = useState(false);
  const live = useRef<HTMLDivElement>(null);
  const notice = params.get("notice");
  const reason = params.get("reason");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (status === "checking") return; // duplicate submission is disabled while authenticating
    setError("");
    if (!email.trim() || !password) { setError("Enter your business email and password."); return; }
    setStatus("checking");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, code: needCode ? code.replace(/\s/g, "") : undefined, returnTo: params.get("returnTo") ?? undefined }) });
      const body = await response.json().catch(() => ({}));
      if (response.ok) { router.replace(body.returnTo ?? "/app/overview"); router.refresh(); return; }
      if (response.status === 428) { setNeedCode(true); setStatus("idle"); return; } // password was right; keep it for the code step
      if (body?.error?.code === "mfa_invalid") { setCode(""); setError(body.error.message ?? "That code is not correct."); setStatus("idle"); return; }
      setError(body?.error?.message ?? "Sign-in failed. Try again.");
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    }
    setPassword("");
    setStatus("idle");
  }

  return (
    <div className="login-shell">
      <aside className="login-brand">
        <LoginCinema />
        <div className="login-brand-top"><Brand /></div>
        <div className="login-copy">
          <h2 className="display">Better evidence.<br />Clearer decisions.<br /><span className="login-accent">One workspace.</span></h2>
          <p className="lead-lg">Inventory, pricing, advertising, leads and your showroom, run by one dealership team.</p>
        </div>
      </aside>
      <LoginBand />
      <div className="login-theme"><ThemeToggle className="icon-btn" /></div>
      <main className="login-form-wrap" id="content" tabIndex={-1}>
        <div className="login-mobile-brand"><Brand sub={false} /></div>
        <form className="login-form login-card" onSubmit={submit} noValidate aria-describedby="login-status">
          <div className="login-head"><h1 className="h1 login-title">Welcome back</h1><p className="muted">Sign in with the Google account your dealership was set up with.</p></div>
          {reason === "expired" ? <Notice tone="warn" role="status">Your session expired. Sign in again. Your non-sensitive setup draft was kept; no password was stored.</Notice> : null}
          {notice === "sso_unavailable" ? <Notice tone="warn" role="status">Google sign-in is not configured for this deployment yet. Ask VandLabs support.</Notice> : null}
          {notice === "sso_unknown" ? <Notice tone="warn" role="status">That sign-in provider is not available. Use Continue with Google.</Notice> : null}
          {notice === "google_no_account" ? <Notice tone="warn" role="status">That Google account does not have access. Use the Google account VandLabs or your dealership owner assigned to you, or ask them to add this one.</Notice> : null}
          {notice === "google_disabled" ? <Notice tone="warn" role="status">This account is suspended. Contact your dealership owner or VandLabs support.</Notice> : null}
          {notice === "google_conflict" ? <Notice tone="warn" role="status">This email is already linked to a different Google account. Sign in with that account, or contact VandLabs support.</Notice> : null}
          {notice === "google_link_not_approved" ? <Notice tone="warn" role="status">Your account needs VandLabs to approve this Google account before it can be used. Contact VandLabs support.</Notice> : null}
          {notice === "google_failed" ? <Notice tone="warn" role="status">Google sign-in did not finish. Try again.</Notice> : null}
          {notice === "sso_wait" ? <Notice tone="warn" role="status">Too many sign-in attempts. Wait a few minutes and try again.</Notice> : null}
          {providers.length ? providers.map((p) => <a key={p.id} className="btn btn-primary btn-block sso-btn" href={`/api/auth/sso/${p.id}${params.get("returnTo") ? `?returnTo=${encodeURIComponent(params.get("returnTo")!)}` : ""}`}>{p.id === "google" ? <GoogleMark /> : null}{p.label}</a>)
            : <Notice tone="warn" role="status">Sign-in is not configured for this deployment yet.</Notice>}
          {legacy ? (
            <>
              <div className="login-divider"><span>legacy password sign-in (migration only)</span></div>
              {error ? <FormSummary errors={{ login: error }} label="Sign-in problem" /> : null}
              <TextField label="Business email" type="email" name="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@dealership.com" />
              <PasswordField label="Password" name="password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setNeedCode(false); }} />
              {needCode ? <TextField label="Authenticator code" name="code" autoComplete="one-time-code" inputMode="numeric" maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} autoFocus /> : null}
              <Button type="submit" variant="secondary" className="btn-block" loading={status === "checking"} loadingLabel="Checking credentials">Sign in with password</Button>
            </>
          ) : null}
          <div id="login-status" role="status" aria-live="polite" className="sr-only">{status === "checking" ? "Checking credentials" : ""}</div>
          <div className="stack-sm">
            <button type="button" className="link-btn" onClick={() => setAccessOpen(true)}>Need access?</button>
            <p className="meta">Access is assigned by VandLabs and your dealership owner. Your Google account&apos;s own security, such as 2-Step Verification, protects your sign-in.</p>
          </div>
        </form>
        <p className="login-help">Questions or feedback? <a className="accent-text" href={supportMailto("Hello from the sign-in page")}>{SUPPORT_EMAIL}</a></p>
        <footer className="login-links"><Link href="/info/privacy">Privacy</Link><span aria-hidden="true">/</span><Link href="/info/terms">Terms</Link><span aria-hidden="true">/</span><Link href="/info/support">Support</Link><span aria-hidden="true">/</span><Link href="/showroom">Showroom</Link><ThemeSwitch /></footer>
      </main>
      <AccessDialog open={accessOpen} onClose={() => setAccessOpen(false)} />
      <div ref={live} className="sr-only" aria-live="polite" />
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

function AccessDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Request access" description="Access is by invitation only." footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="stack">
        <p>Ask your dealership owner to add your Google account email in Settings, Team. Then come back here and choose Continue with Google. No password or link is needed.</p>
        <p>To set up a new dealership workspace, write to <a className="accent-text" href={supportMailto("New dealership workspace")}>{SUPPORT_EMAIL}</a>.</p>
      </div>
    </Dialog>
  );
}
