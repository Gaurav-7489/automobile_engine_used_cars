"use client";

import { useEffect, useMemo, useState } from "react";
import { commercePlans } from "@vandlabs/contracts";
import { FEATURES, type FeatureKey } from "@/lib/entitlements";
import { Dialog } from "../overlay";
import { Button, Check, FormSummary, Notice, PasswordField, SelectField, Skeleton, TextField } from "../ui";
import { call, useReauth } from "./shared";

type Loaded = { entitlements: { subscription: { plan: string; status: string; expiresAt: string; reference: string } | null }; features: Partial<Record<FeatureKey, boolean>>; usage: Record<string, unknown>; sources: { id: string; name: string; kind: string; enabled: boolean; expiresAt: string; agreement?: string; dealerUse?: boolean; aiProcessing?: boolean; redistribute?: boolean }[] };

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
            <SourceEditor tenantId={tenantId} sources={loaded.sources} auth={auth} password={password} onChanged={() => void load()} />
            {auth.needsPassword ? <PasswordField label="Confirm your password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" error={errors.password} /> : <Notice>Your identity was confirmed a moment ago.</Notice>}
          </>
        ) : null}
      </div>
    </Dialog>
  );
}

type SourceRow = Loaded["sources"][number];

/** Approves or switches off the sourcing data sources behind acquisition research and the business API. Each change is confirmed and audited. */
function SourceEditor({ tenantId, sources, auth, password, onChanged }: { tenantId: string; sources: SourceRow[]; auth: ReturnType<typeof useReauth>; password: string; onChanged: () => void }) {
  const blank = { id: "", name: "", kind: "licensed_api", agreement: "", expiresOn: "", dealerUse: true, aiProcessing: false, redistribute: false, enabled: true };
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const send = async (body: object) => {
    setBusy(true); setErrors({}); setNote("");
    const failed = await auth.confirm(password);
    if (failed) { setBusy(false); setErrors({ form: failed }); return false; }
    const r = await call<object>(`/api/admin/workspaces/${tenantId}/sources`, { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    if (r.data.error?.code === "reauth_required") auth.expired();
    if (!r.ok) { setErrors({ ...(r.data.error?.fields ?? {}), form: r.data.error?.message ?? "Nothing was changed." }); return false; }
    setNote("Source saved and audited."); onChanged(); return true;
  };
  return (
    <section className="stack-sm" aria-labelledby="src-ed">
      <h3 className="h3" id="src-ed">Sourcing data sources</h3>
      {!sources.length ? <p className="meta">None approved. Acquisition research and the business API have nothing to use.</p> : (
        <ul className="list-plain">{sources.map((s) => (
          <li key={s.id} className="row-flex between"><span>{s.name} <span className="meta">({s.kind}, until {s.expiresAt.slice(0, 10)}{s.enabled ? "" : ", off"})</span></span>
            <Button size="sm" loading={busy} loadingLabel="Saving…" onClick={() => void send({ id: s.id, name: s.name, kind: s.kind, agreement: s.agreement ?? "Existing agreement", expiresOn: s.expiresAt.slice(0, 10), dealerUse: s.dealerUse ?? true, aiProcessing: s.aiProcessing ?? false, redistribute: s.redistribute ?? false, enabled: !s.enabled })}>{s.enabled ? "Turn off" : "Turn on"}</Button></li>))}</ul>
      )}
      {note ? <Notice tone="accent" role="status">{note}</Notice> : null}
      <FormSummary errors={errors.form ? { form: errors.form } : {}} />
      {!open ? <Button size="sm" onClick={() => setOpen(true)}>Approve a source</Button> : (
        <div className="stack">
          <div className="form-grid">
            <TextField label="Source ID" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} error={errors.id} help="Lowercase letters, digits, dashes." />
            <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} />
            <SelectField label="Type" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} options={[{ value: "licensed_api", label: "Licensed API or feed" }, { value: "dealer", label: "Dealer-supplied" }]} error={errors.kind} />
            <TextField label="Agreement ends" type="date" value={form.expiresOn} onChange={(e) => setForm({ ...form, expiresOn: e.target.value })} error={errors.expiresOn} />
          </div>
          <TextField label="Agreement or licence reference" value={form.agreement} onChange={(e) => setForm({ ...form, agreement: e.target.value })} error={errors.agreement} />
          <Check label="The agreement permits dealer use" checked={form.dealerUse} onChange={(v) => setForm({ ...form, dealerUse: v })} />
          <Check label="The agreement permits AI processing" checked={form.aiProcessing} onChange={(v) => setForm({ ...form, aiProcessing: v })} />
          <Check label="The agreement permits redistribution through the business API" checked={form.redistribute} onChange={(v) => setForm({ ...form, redistribute: v })} />
          <div className="row-flex"><Button variant="primary" loading={busy} loadingLabel="Saving source…" onClick={async () => { if (await send(form)) { setForm(blank); setOpen(false); } }}>Save source</Button><Button onClick={() => setOpen(false)}>Cancel</Button></div>
        </div>
      )}
    </section>
  );
}
