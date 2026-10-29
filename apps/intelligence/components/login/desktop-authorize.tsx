"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { call } from "../admin/shared";
import { Button, FormSummary, Notice } from "../ui";

const REDIRECT = "http://localhost:43821/callback";

function Inner() {
  const params = useSearchParams();
  const challenge = params.get("challenge") ?? "", state = params.get("state") ?? "";
  const valid = /^[A-Za-z0-9_-]{43}$/.test(challenge) && /^[A-Za-z0-9_-]{16,128}$/.test(state);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const approve = async () => {
    setBusy(true); setError("");
    const r = await call<{ code: string }>("/api/desktop/authorize", { method: "POST", body: JSON.stringify({ challenge }) });
    if (!r.ok) { setBusy(false); setError(r.data.error?.message ?? "Approval failed. Try again."); return; }
    setDone(true);
    window.location.assign(`${REDIRECT}?code=${encodeURIComponent(r.data.code)}&state=${encodeURIComponent(state)}`);
  };
  return (
    <main className="auth-page" style={{ maxWidth: 480, margin: "10vh auto", padding: "0 16px" }}>
      <section className="card stack">
        <h1 className="h2" id="page-title">Connect the desktop application</h1>
        {!valid ? <Notice tone="danger" role="alert">This link is not valid. Start sign-in again from the desktop application.</Notice> : (
          <>
            <p className="muted">The VandLabs desktop application on this computer is asking to sign in with your account and your permissions. Only continue if you just started this from the application.</p>
            <FormSummary errors={error ? { form: error } : {}} />
            {done ? <Notice tone="accent" role="status">Approved. You can return to the desktop application.</Notice> : null}
            <Button variant="primary" loading={busy} loadingLabel="Approving…" disabled={done} onClick={approve}>Approve sign-in</Button>
          </>
        )}
      </section>
    </main>
  );
}

export function DesktopAuthorize() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
