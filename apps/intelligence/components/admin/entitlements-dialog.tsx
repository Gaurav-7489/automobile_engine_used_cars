"use client";

import { useEffect, useMemo, useState } from "react";
import { commercePlans } from "@vandlabs/contracts";
import { FEATURES, type FeatureKey } from "@/lib/entitlements";
import { Dialog } from "../overlay";
import { Button, Check, FormSummary, Notice, PasswordField, SelectField, Skeleton, TextField } from "../ui";
import { call, useReauth } from "./shared";

type Loaded = { entitlements: { subscription: { plan: string; status: string; expiresAt: string; reference: string } | null }; features: Partial<Record<FeatureKey, boolean>>; usage: Record<string, unknown>; sources: { id: string; name: string; kind: string; enabled: boolean; expiresAt: string }[] };

/** Subscription and feature switches for one dealership. Needs a password confirmation; the change is audited. */
export function EntitlementsDialog({ tenantId, name, onClose, onSaved }: { tenantId: string; name: string; onClose: () => void; onSaved: () => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [sub, setSub] = useState({ plan: "starter", status: "active", expiresOn: "", reference: "" });
  const [off, setOff] = useState<Set<FeatureKey>>(new Set());
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const auth = useReauth();

  const load = async () => {
    setLoadError("");
    const r = await call<Loaded>(`/api/admin/workspaces/${tenantId}/entitlements`);
    if (!r.ok) { setLoadError(r.data.error?.message ?? "Access settings could not be loaded."); return; }
    setLoaded(r.data);
    const s = r.data.entitlements.subscription;
    setSubscribed(Boolean(s));
    if (s) setSub({ plan: s.plan, status: s.status, expiresOn: s.expiresAt.slice(0, 10), reference: s.reference });
    setOff(new Set((Object.entries(r.data.features) as [FeatureKey, boolean][]).filter(([, v]) => v === false).map(([k]) => k)));
  };
  useEffect(() => { void load(); }, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(() => Boolean(loaded) && !done, [loaded, done]);

  const save = async () => {
    setBusy(true); setErrors({}); setDone(false);
    const failed = await auth.confirm(password);
    if (failed) { setBusy(false); setErrors({ password: failed }); return; }
    const features = Object.fromEntries(FEATURES.map((f) => [f.key, !off.has(f.key)]));
    const r = await call<object>(`/api/admin/workspaces/${tenantId}/entitlements`, { method: "POST", body: JSON.stringify({ subscription: subscribed ? sub : null, features }) });
    setBusy(false);
    if (r.data.error?.code === "reauth_required") auth.expired();
    if (r.ok) { setDone(true); onSaved(); return; }
    setErrors({ ...(r.data.error?.fields ?? {}), form: r.data.error?.message ?? "Nothing was changed." });
  };

  return (
    <Dialog open onClose={onClose} dirty={dirty && !done} size="w640" title={`Plan and access: ${name}`} description="What this dealership can use. Changes apply within seconds and are written to the platform audit log."
      footer={<><Button onClick={onClose}>{done ? "Close" : "Cancel"}</Button><Button variant="primary" loading={busy} loadingLabel="Saving access…" disabled={!loaded} onClick={save}>{done ? "Saved: save again" : "Save access"}</Button></>}>
      <div className="stack">
        {loadError ? <Notice tone="danger" role="alert">{loadError} <button className="link-btn" onClick={() => void load()}>Retry</button></Notice> : null}
        {!loaded && !loadError ? <div className="stack" role="status" aria-label="Loading access settings"><Skeleton h={32} /><Skeleton h={120} /></div> : null}
        {done ? <Notice tone="accent" role="status">Access saved and audited.</Notice> : null}
        {loaded ? (
          <>
            <FormSummary errors={errors.form ? { form: errors.form } : {}} />
            <Check label="This dealership has a contracted subscription" checked={subscribed} onChange={setSubscribed} help="Acquisition research and the business API need an active subscription. Record it only against an approved contract or invoice; no payment is taken here." />
            {subscribed ? (
              <div className="form-grid">
                <SelectField label="Plan" value={sub.plan} onChange={(e) => setSub({ ...sub, plan: e.target.value })} options={Object.entries(commercePlans).map(([k, p]) => ({ value: k, label: `${p.name} (${p.monthlyRequests.toLocaleString("en-IN")} requests a month, ${p.maxKeys} key${p.maxKeys > 1 ? "s" : ""}, ${p.maxCars} car${p.maxCars > 1 ? "s" : ""})` }))} error={errors.plan} />
                <SelectField label="Status" value={sub.status} onChange={(e) => setSub({ ...sub, status: e.target.value })} options={[{ value: "active", label: "Active" }, { value: "suspended", label: "Suspended" }, { value: "cancelled", label: "Cancelled" }]} error={errors.status} />
                <TextField label="Last day of access" type="date" value={sub.expiresOn} onChange={(e) => setSub({ ...sub, expiresOn: e.target.value })} error={errors.expiresOn} />
                <TextField label="Contract or invoice reference" value={sub.reference} onChange={(e) => setSub({ ...sub, reference: e.target.value })} error={errors.reference} />
              </div>
            ) : null}
            <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="h3">Features</legend>
              <p className="meta">Everything is included unless switched off here. Plan tiers do not change which features are available.</p>
              {errors.features ? <div className="field-error" role="alert">{errors.features}</div> : null}
              {FEATURES.map((f) => (
                <Check key={f.key} label={<>{f.label}{f.needsSubscription ? <span className="meta"> (also needs an active subscription)</span> : null}</>} checked={!off.has(f.key)} help={f.description}
                  onChange={(on) => setOff((cur) => { const next = new Set(cur); if (on) next.delete(f.key); else next.add(f.key); return next; })} />
              ))}
            </fieldset>
            {loaded.sources.length ? <p className="meta">Approved data sources: {loaded.sources.map((s) => `${s.name} (${s.kind}${s.enabled ? "" : ", off"})`).join("; ")}.</p> : null}
            {auth.needsPassword ? <PasswordField label="Confirm your password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" error={errors.password} /> : <Notice>Your identity was confirmed a moment ago.</Notice>}
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
