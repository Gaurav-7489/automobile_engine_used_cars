"use client";

import Link from "next/link";
import { useState } from "react";
import type { AccessRequestStatus } from "@/lib/server/access-requests";
import { Brand } from "../brand";
import { Button, FormSummary, Notice, TextArea, TextField } from "../ui";

type Props = { identity: { email: string; name: string } | null; status: AccessRequestStatus };

/** A verified Google account without access asks VandLabs for a dealership workspace. Nothing is granted until VandLabs approves. */
export function RequestAccess({ identity, status }: Props) {
  const [form, setForm] = useState({ name: identity?.name ?? "", businessName: "", dealershipName: "", phone: "", city: "", state: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setErrors({});
    try {
      const r = await fetch("/api/auth/access-request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const b = await r.json().catch(() => ({}));
      if (r.ok) { setSent(true); return; }
      setErrors({ ...(b?.error?.fields ?? {}), ...(b?.error?.fields ? {} : { form: b?.error?.message ?? "Your request could not be sent. Try again." }) });
    } catch {
      setErrors({ form: "We could not reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  const pending = sent || status?.status === "pending";
  return (
    <div className="login-shell">
      <aside className="login-brand"><Brand /></aside>
      <main className="login-form-wrap" id="content" tabIndex={-1}>
        <div className="login-mobile-brand"><Brand sub={false} /></div>
        {!identity ? (
          <div className="login-form stack">
            <h1 className="h1" style={{ fontSize: 32, lineHeight: "40px" }}>Request access</h1>
            <Notice tone="warn" role="status">Sign in with Google first. Then, if your account has no access yet, you can send your dealership&apos;s details here.</Notice>
            <a className="btn btn-primary btn-block" href="/api/auth/sso/google">Continue with Google</a>
          </div>
        ) : pending ? (
          <div className="login-form stack">
            <h1 className="h1" style={{ fontSize: 32, lineHeight: "40px" }}>Request received</h1>
            <Notice tone="accent" role="status">VandLabs is reviewing your request for <strong>{identity.email}</strong>{status?.businessName && !sent ? ` (${status.businessName})` : ""}. Once it is approved, come back and choose Continue with Google with this account.</Notice>
            <Link className="btn btn-block" href="/login">Back to sign in</Link>
          </div>
        ) : status?.status === "declined" ? (
          <div className="login-form stack">
            <h1 className="h1" style={{ fontSize: 32, lineHeight: "40px" }}>Request not approved</h1>
            <Notice tone="warn" role="status">Your earlier request was not approved. You can send updated details below, or contact VandLabs support.</Notice>
          </div>
        ) : null}
        {identity && !pending ? (
          <form className="login-form" onSubmit={submit} noValidate>
            <div>
              <h1 className="h1" style={{ fontSize: 32, lineHeight: "40px" }}>Request access</h1>
              <p className="muted" style={{ marginTop: 8 }}>Signed in with Google as <strong>{identity.email}</strong>. This account has no access yet. Tell us about your dealership and VandLabs will set it up.</p>
            </div>
            {errors.form ? <FormSummary errors={{ form: errors.form }} label="Problem" /> : null}
            <TextField label="Your name" value={form.name} onChange={set("name")} error={errors.name} autoComplete="name" />
            <TextField label="Registered business name" value={form.businessName} onChange={set("businessName")} error={errors.businessName} placeholder="Sharma Motors Pvt Ltd" />
            <TextField label="Dealership name" value={form.dealershipName} onChange={set("dealershipName")} error={errors.dealershipName} placeholder="Sharma Motors" />
            <TextField label="Mobile" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} error={errors.phone} autoComplete="tel" placeholder="+91" />
            <TextField label="City" value={form.city} onChange={set("city")} error={errors.city} />
            <TextField label="State" value={form.state} onChange={set("state")} error={errors.state} />
            <TextArea label="Anything else (optional)" value={form.message} onChange={set("message")} rows={3} maxLength={600} />
            <Button type="submit" variant="primary" className="btn-block" loading={busy} loadingLabel="Sending">Send request</Button>
            <p className="meta">Only this Google account ({identity.email}) can be given access from this request.</p>
          </form>
        ) : null}
      </main>
    </div>
  );
}
