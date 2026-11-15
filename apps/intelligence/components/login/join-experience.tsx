"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Brand } from "../brand";
import { Button, FormSummary, Notice, PasswordField } from "../ui";

type Info = { kind: "invite" | "reset"; email: string; name: string };

/** An invitation link: the invited person signs in with Google using that email (a password form exists only while LEGACY_PASSWORD_LOGIN=enabled). */
export function JoinExperience({ token, legacy = false }: { token: string; legacy?: boolean }) {
  const router = useRouter();
  const [info, setInfo] = useState<Info | "invalid" | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/auth/redeem?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as Info) : "invalid"))
      .catch(() => "invalid" as const)
      .then((v) => { if (!cancelled) setInfo(v); });
    return () => { cancelled = true; };
  }, [token]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (password !== confirm) { setError("The two passwords do not match."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/redeem", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }) });
      const body = await response.json().catch(() => ({}));
      if (response.ok) { router.replace("/app/overview"); router.refresh(); return; }
      setError(body?.error?.message ?? "This could not be completed. Try again.");
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  return (
    <div className="login-shell">
      <aside className="login-brand"><Brand /></aside>
      <main className="login-form-wrap" id="content" tabIndex={-1}>
        <div className="login-mobile-brand"><Brand sub={false} /></div>
        {info === null ? <p className="muted" role="status">Checking your link…</p> : info === "invalid" ? (
          <div className="login-form stack">
            <h1 className="h1" style={{ fontSize: 32, lineHeight: "40px" }}>This link cannot be used</h1>
            <Notice tone="warn" role="alert">It may have expired or already been used. Ask your workspace owner for a new one.</Notice>
            <Link className="btn" href="/login">Back to sign in</Link>
          </div>
        ) : !legacy ? (
          <div className="login-form stack">
            <h1 className="h1" style={{ fontSize: 32, lineHeight: "40px" }}>{info.kind === "reset" ? "Passwords are no longer used" : "Your access is ready"}</h1>
            <p className="muted">{info.kind === "reset" ? "Sign in with Google using" : "Sign in with the Google account for"} <strong>{info.email}</strong>. No password is needed.</p>
            <a className="btn btn-primary btn-block sso-btn" href="/api/auth/sso/google">Continue with Google</a>
            <p className="meta">Use exactly this email&apos;s Google account. Other Google accounts are refused.</p>
          </div>
        ) : (
          <form className="login-form" onSubmit={submit} noValidate>
            <div>
              <h1 className="h1" style={{ fontSize: 32, lineHeight: "40px" }}>{info.kind === "reset" ? "Choose a new password" : "Set your password"}</h1>
              <p className="muted" style={{ marginTop: 8 }}>{info.kind === "reset" ? "For" : "Welcome. This invitation is for"} <strong>{info.email}</strong>.</p>
            </div>
            {error ? <FormSummary errors={{ form: error }} label="Problem" /> : null}
            <PasswordField label="New password" name="new-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} help="At least 12 characters. Use a phrase only you know." />
            <PasswordField label="Confirm password" name="confirm-password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <Button type="submit" variant="primary" className="btn-block" loading={busy} loadingLabel="Saving">{info.kind === "reset" ? "Save password and sign in" : "Create account and sign in"}</Button>
            <a className="btn btn-block" href="/api/auth/sso/google">Or continue with Google</a>
          </form>
        )}
      </main>
    </div>
  );
}
