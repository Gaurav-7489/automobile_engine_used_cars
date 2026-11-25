"use client";
import { clearRemoteCache } from "@/lib/remote-cache";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Brand } from "../brand";
import { Dialog } from "../overlay";
import { Button, FormSummary, Notice, PasswordField, TextField } from "../ui";
import styles from "./login-experience.module.css";
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
    <div className={styles.shell}>
      <header className={styles.hero}>
        <div className={styles.identity}>
          <Brand sub={false} />
          <span className={styles.product}>Automotive Intelligence</span>
        </div>
      </header>
      <main className={styles.panel} id="content" tabIndex={-1}>
        <div className={styles.content}>
          <form className={styles.form} onSubmit={submit} noValidate aria-describedby="login-status">
            <div className={styles.heading}>
              <h1 className={styles.title}>Welcome<br />to <em>VandLabs</em></h1>
              <p>Sign in with the Google account your dealership was set up with.</p>
            </div>
            {reason === "expired" ? <Notice tone="warn" role="status">Your session expired. Sign in again. Your non-sensitive setup draft was kept; no password was stored.</Notice> : null}
            {notice === "sso_unavailable" ? <Notice tone="warn" role="status">Google sign-in is not configured for this deployment yet. Ask VandLabs support.</Notice> : null}
            {notice === "sso_unknown" ? <Notice tone="warn" role="status">That sign-in provider is not available. Use Continue with Google.</Notice> : null}
            {notice === "google_no_account" ? <Notice tone="warn" role="status">That Google account does not have access. Use the Google account VandLabs or your dealership owner assigned to you, or ask them to add this one.</Notice> : null}
            {notice === "google_disabled" ? <Notice tone="warn" role="status">This account is suspended. Contact your dealership owner or VandLabs support.</Notice> : null}
            {notice === "google_conflict" ? <Notice tone="warn" role="status">This email is already linked to a different Google account. Sign in with that account, or contact VandLabs support.</Notice> : null}
            {notice === "google_link_not_approved" ? <Notice tone="warn" role="status">Your account needs VandLabs to approve this Google account before it can be used. Contact VandLabs support.</Notice> : null}
            {notice === "google_failed" ? <Notice tone="warn" role="status">Google sign-in did not finish. Try again.</Notice> : null}
            {notice === "sso_wait" ? <Notice tone="warn" role="status">Too many sign-in attempts. Wait a few minutes and try again.</Notice> : null}
            {legacy ? (
              <>
                <p className={styles.legacyLabel}>Migration access</p>
                {error ? <FormSummary errors={{ login: error }} label="Sign-in problem" /> : null}
                <TextField label="Business email" type="email" name="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@dealership.com" />
                <PasswordField label="Password" name="password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setNeedCode(false); }} />
                {needCode ? <TextField label="Authenticator code" name="code" autoComplete="one-time-code" inputMode="numeric" maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} autoFocus /> : null}
                <Button type="submit" variant="primary" className="btn-block" loading={status === "checking"} loadingLabel="Checking credentials">Sign in with password</Button>
              </>
            ) : null}
            {legacy && providers.length > 0 ? <div className={styles.divider}>Or continue with</div> : null}
            {providers.length ? providers.map((p) => <ProviderLink key={p.id} provider={p} href={`/api/auth/sso/${p.id}${params.get("returnTo") ? `?returnTo=${encodeURIComponent(params.get("returnTo")!)}` : ""}`} />)
              : <Notice tone="warn" role="status">Sign-in is not configured for this deployment yet.</Notice>}
            <div id="login-status" role="status" aria-live="polite" className="sr-only">{status === "checking" ? "Checking credentials" : ""}</div>
          </form>
          <p className={styles.access}>New to VandLabs? <button type="button" onClick={() => setAccessOpen(true)}>Request access</button></p>
          <footer className={styles.links}>
            <Link href="/info/privacy">Privacy</Link>
            <Link href="/info/terms">Terms</Link>
            <Link href="/info/support">Support</Link>
            <Link href="/showroom">Showroom</Link>
          </footer>
        </div>
      </main>
      <AccessDialog open={accessOpen} onClose={() => setAccessOpen(false)} />
    </div>
  );
}

type Provider = Props["providers"][number];

// The sign-in handoff: the button shows it is working, then ink spreads from the
// click point to cover the page while the browser leaves for the provider.
function ProviderLink({ provider, href }: { provider: Provider; href: string }) {
  const [phase, setPhase] = useState<"idle" | "loading" | "spreading">("idle");
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Coming back with the browser's Back button restores this page from cache; reset it.
    const reset = (event: PageTransitionEvent) => { if (event.persisted) { window.clearTimeout(timer.current); setPhase("idle"); } };
    window.addEventListener("pageshow", reset);
    return () => { window.removeEventListener("pageshow", reset); window.clearTimeout(timer.current); };
  }, []);

  function start(event: React.MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (phase !== "idle") return;
    const rect = event.currentTarget.getBoundingClientRect();
    // Keyboard activation reports 0,0; spread from the button's centre instead.
    const fromPointer = event.clientX !== 0 || event.clientY !== 0;
    setOrigin({ x: fromPointer ? event.clientX : rect.left + rect.width / 2, y: fromPointer ? event.clientY : rect.top + rect.height / 2 });
    setPhase("loading");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduced";
    if (reduced) { window.location.assign(href); return; }
    timer.current = window.setTimeout(() => {
      setPhase("spreading");
      timer.current = window.setTimeout(() => window.location.assign(href), 520);
    }, 380);
  }

  const busy = phase !== "idle";
  return (
    <>
      <a className={styles.google} href={href} onClick={start} aria-busy={busy || undefined} data-state={phase}>
        <span className={styles.googleIcon}>{busy ? <span className={styles.spinner} aria-hidden="true" /> : provider.id === "google" ? <GoogleMark /> : null}</span>
        <span>{busy ? `Connecting to ${provider.id === "google" ? "Google" : provider.label.replace(/^Continue with /, "")}…` : provider.label}</span>
      </a>
      {phase === "spreading" ? (
        <div className={styles.ink} style={{ "--ink-x": `${origin.x}px`, "--ink-y": `${origin.y}px` } as React.CSSProperties} role="status" aria-live="polite">
          <div className={styles.inkContent}>
            <Brand sub={false} />
            <span className={styles.inkLabel}>Opening secure sign-in</span>
            <span className={styles.inkBar} aria-hidden="true" />
          </div>
        </div>
      ) : null}
    </>
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
        <p>New dealership? Choose Continue with Google. If your Google account has no access yet, you can send your dealership&apos;s details and VandLabs will set it up.</p>
        <p>Joining an existing dealership? Ask its owner to add your Google email in Settings, Team, then choose Continue with Google.</p>
        <p>To set up a new dealership workspace, write to <a className="accent-text" href={supportMailto("New dealership workspace")}>{SUPPORT_EMAIL}</a>.</p>
      </div>
    </Dialog>
  );
}
