"use client";

import { ThemeSwitch, ThemeToggle } from "../theme";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { Brand } from "../brand";
import { Dialog } from "../overlay";
import { Button, Check, FormSummary, Notice, PasswordField, TextField } from "../ui";
import { VehicleArt } from "../vehicle-art";

type Props = { providers: { id: "google" | "microsoft"; label: string }[] };


export function LoginExperience({ providers }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [remember, setRemember] = useState(false);
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
      <aside className="login-brand" aria-hidden={false}>
        <Brand />
        <div className="login-copy">
          <h2 className="display">Better evidence.<br />Clearer decisions.<br />One workspace.</h2>
          <p className="lead-lg">Inventory, market comparisons and controlled execution for the dealership team.</p>
        </div>
        <div className="login-art"><VehicleArt ratio="21 / 9" /></div>
      </aside>
      <div className="login-theme"><ThemeToggle className="icon-btn" /></div>
      <main className="login-form-wrap" id="content" tabIndex={-1}>
        <div className="login-mobile-brand"><Brand sub={false} /></div>
        <form className="login-form" onSubmit={submit} noValidate aria-describedby="login-status">
          <div><h1 className="h1" style={{ fontSize: 32, lineHeight: "40px" }}>Welcome back</h1><p className="muted" style={{ marginTop: 8 }}>Sign in to your dealership workspace.</p></div>
          {reason === "expired" ? <Notice tone="warn" role="status">Your session expired. Sign in again. Your non-sensitive setup draft was kept; no password was stored.</Notice> : null}
          {notice === "sso_unavailable" ? <Notice tone="warn" role="status">{provider} sign-in is not available in this environment yet. Use your email and password, or ask your administrator to enable it.</Notice> : null}
          {notice === "sso_unknown" ? <Notice tone="warn" role="status">That sign-in provider is not configured for this workspace.</Notice> : null}
          {error ? <FormSummary errors={{ login: error }} label="Sign-in problem" /> : null}
          <TextField label="Business email" type="email" name="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@dealership.com" />
          <PasswordField label="Password" name="password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setNeedCode(false); }} />
          {needCode ? <TextField label="Authenticator code" name="code" autoComplete="one-time-code" inputMode="numeric" maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} help="Two-factor login is on for this account. Enter the 6-digit code from your authenticator app." autoFocus /> : null}
          <div className="spread" style={{ flexWrap: "wrap" }}>
            <Check label="Remember this device" checked={remember} onChange={setRemember} />
            <button type="button" className="link-btn" onClick={() => setForgotOpen(true)}>Forgot password?</button>
          </div>
          <Button type="submit" variant="primary" className="btn-block" loading={status === "checking"} loadingLabel="Checking credentials">Sign in</Button>
          <div id="login-status" role="status" aria-live="polite" className="sr-only">{status === "checking" ? "Checking credentials" : ""}</div>
          {providers.length ? (
            <>
              <div className="login-divider"><span>Or use configured SSO</span></div>
              <div className="sso-row">{providers.map((p) => <a key={p.id} className="btn" href={`/api/auth/sso/${p.id}`}>{p.label}</a>)}</div>
            </>
          ) : null}
          <div className="stack-sm">
            <button type="button" className="link-btn" onClick={() => setAccessOpen(true)}>Need access?</button>
            <p className="meta">Organisation access is assigned by your administrator. MFA may be required.</p>
          </div>
        </form>
        <footer className="login-links"><Link href="/info/privacy">Privacy</Link><span aria-hidden="true">/</span><Link href="/info/terms">Terms</Link><span aria-hidden="true">/</span><Link href="/info/support">Support</Link><span aria-hidden="true">/</span><Link href="/showroom">Showroom</Link><ThemeSwitch /></footer>
      </main>
      <ForgotDialog open={forgotOpen} onClose={() => setForgotOpen(false)} />
      <AccessDialog open={accessOpen} onClose={() => setAccessOpen(false)} />
      <div ref={live} className="sr-only" aria-live="polite" />
    </div>
  );
}

function ForgotDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Reset your password" description="Resets are issued by your workspace owner." footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <Notice tone="accent" role="status">Ask a workspace owner to open Settings, Team and issue a one-time reset link for your account. The link expires in 60 minutes and signs you out everywhere once used.</Notice>
    </Dialog>
  );
}

function AccessDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Request access" description="Access is by invitation only." footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="stack">
        <p>Ask your workspace owner to invite you from Settings, Team. You will receive a one-time link to choose your own password.</p>
        <p>To set up a new dealership workspace, <Link href="/info/support">contact VandLabs</Link>.</p>
      </div>
    </Dialog>
  );
}
