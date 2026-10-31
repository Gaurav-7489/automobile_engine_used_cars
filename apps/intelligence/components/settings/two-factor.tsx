"use client";
import { useEffect, useState } from "react";
import { useToast } from "../toast";
import { Button, PasswordField, TextField } from "../ui";

async function reauth(password: string): Promise<string | null> {
  try {
    const r = await fetch("/api/auth/reauth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    if (r.ok) return null;
    const body = await r.json().catch(() => ({}));
    return body?.error?.message ?? "Re-authentication failed.";
  } catch { return "We could not reach the server. Try again."; }
}

async function twoFactor(body: Record<string, string>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const r = await fetch("/api/auth/two-factor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  } catch { return { ok: false, data: { error: { message: "We could not reach the server. Try again." } } }; }
}

/** Two-factor enrolment and removal. `onEnabled` runs after a successful enrolment (the admin gate uses it to continue). */
export function TwoFactor({ onEnabled }: { onEnabled?: () => void } = {}) {
  const toast = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [step, setStep] = useState<"idle" | "password" | "scan" | "disable">("idle");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [secret, setSecret] = useState<{ secret: string; uri: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/auth/two-factor").then((r) => r.json()).then((b) => setEnabled(Boolean(b.enabled))).catch(() => setEnabled(null)); }, []);
  const message = (d: Record<string, unknown>) => ((d.error as { message?: string } | undefined)?.message ?? "Something went wrong. Try again.");
  const reset = () => { setStep("idle"); setPassword(""); setCode(""); setSecret(null); setError(""); };

  async function begin() {
    setBusy(true); setError("");
    const failed = await reauth(password);
    if (failed) { setBusy(false); setError(failed); return; }
    const r = await twoFactor({ action: "begin" });
    setBusy(false);
    if (!r.ok) { setError(message(r.data)); return; }
    setSecret({ secret: String(r.data.secret), uri: String(r.data.uri) }); setPassword(""); setStep("scan");
  }
  async function finish(action: "confirm" | "disable") {
    setBusy(true); setError("");
    const r = await twoFactor({ action, code });
    setBusy(false);
    if (!r.ok) { setError(message(r.data)); setCode(""); return; }
    setEnabled(action === "confirm"); reset();
    toast(action === "confirm" ? "Two-factor login is on. You will be asked for a code at each sign-in." : "Two-factor login is off.");
    if (action === "confirm") onEnabled?.();
  }

  return (
    <div className="stack-sm">
      <h3 className="h3">Two-factor login</h3>
      <p className="muted">{enabled === null ? "Checking status." : enabled ? "On. Each sign-in needs your password and a 6-digit code from your authenticator app." : "Off. Turn it on to require a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password and similar) at sign-in."}</p>
      {step === "idle" && enabled === false ? <div><Button variant="primary" onClick={() => setStep("password")}>Turn on two-factor login</Button></div> : null}
      {step === "idle" && enabled ? <div><Button onClick={() => setStep("disable")}>Turn off two-factor login</Button></div> : null}
      {step === "password" ? (
        <div className="stack-sm">
          <PasswordField label="Confirm your password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" error={error} />
          <span className="row-flex"><Button variant="primary" loading={busy} loadingLabel="Checking" disabled={!password} onClick={begin}>Continue</Button><Button onClick={reset}>Cancel</Button></span>
        </div>
      ) : null}
      {step === "scan" && secret ? (
        <div className="stack-sm">
          <p>In your authenticator app, add an account using this setup key, or open the link on the phone that has the app.</p>
          <p><code style={{ wordBreak: "break-all", fontSize: 15 }}>{secret.secret.replace(/(.{4})/g, "$1 ").trim()}</code></p>
          <p><a className="link-btn" href={secret.uri}>Open in authenticator app</a></p>
          <TextField label="6-digit code from the app" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} error={error} />
          <span className="row-flex"><Button variant="primary" loading={busy} loadingLabel="Verifying" disabled={code.replace(/\s/g, "").length < 6} onClick={() => finish("confirm")}>Turn on</Button><Button onClick={reset}>Cancel</Button></span>
        </div>
      ) : null}
      {step === "disable" ? (
        <div className="stack-sm">
          <TextField label="Current 6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} error={error} help="A current code is needed so a stolen session cannot switch this off." />
          <span className="row-flex"><Button variant="danger" loading={busy} loadingLabel="Verifying" disabled={code.replace(/\s/g, "").length < 6} onClick={() => finish("disable")}>Turn off</Button><Button onClick={reset}>Cancel</Button></span>
        </div>
      ) : null}
    </div>
  );
}
