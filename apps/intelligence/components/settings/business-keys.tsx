"use client";

import { useEffect, useState } from "react";
import { formatShortDateTime } from "@/lib/format";
import type { BusinessKeyView } from "@/lib/server/business-api";
import { call, useReauth } from "../admin/shared";
import { Dialog } from "../overlay";
import { useToast } from "../toast";
import { Badge, Button, Check, EmptyState, FormSummary, Notice, PasswordField, SelectField, TextField } from "../ui";
import { useWorkspace } from "../workspace";

type Data = { keys: BusinessKeyView[]; sources: { id: string; name: string }[]; limit: number | null };
const SCOPE_LABEL: Record<string, string> = { "vehicles:read": "Read sourcing vehicles", "fuel:read": "Read fuel prices", "recommendations:read": "Acquisition recommendations", "sourcing:write": "Supplier ingest (one approved source)" };

/** Business API keys for the dealership's own systems and approved suppliers. Separate from the read-only stock and lead keys above. */
export function BusinessKeys() {
  const { can, state } = useWorkspace();
  const toast = useToast();
  const allowed = can("settings.keys") && state.entitlements?.features.api_access.enabled !== false;
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const load = async () => { const r = await call<Data>("/api/settings/business-keys"); if (r.ok) { setData(r.data); setError(""); } else setError(r.data.error?.message ?? "Business keys could not be loaded."); };
  useEffect(() => { if (allowed) void load(); }, [allowed]);
  if (!can("settings.keys")) return null;
  if (!allowed) return <section className="card stack"><h2 className="h2">Business API</h2><Notice tone="warn" role="status">{state.entitlements?.features.api_access.reason}</Notice></section>;
  const revoke = async (k: BusinessKeyView) => {
    if (!window.confirm(`Revoke “${k.name}”? Systems using it stop working immediately.`)) return;
    const r = await call<object>(`/api/settings/business-keys?id=${k.id}`, { method: "DELETE" });
    if (r.ok) { toast("Key revoked."); void load(); } else toast(r.data.error?.message ?? "The key was not revoked.", "error");
  };
  return (
    <section className="card stack" aria-labelledby="biz-h">
      <div className="spread" style={{ flexWrap: "wrap" }}><h2 className="h2" id="biz-h">Business API</h2><Button variant="primary" onClick={() => setCreating(true)}>Create business key</Button></div>
      <p className="muted">For your own systems and approved suppliers: sourcing vehicles, fuel prices, acquisition recommendations and supplier ingest. Calls count against your plan{data?.limit ? ` (up to ${data.limit} active key${data.limit > 1 ? "s" : ""})` : ""}. Keys are shown once.</p>
      {shown ? <Notice tone="accent" role="alert"><div className="stack-sm"><strong>Copy this key now. It will not be shown again.</strong><code style={{ wordBreak: "break-all" }}>{shown}</code><span className="row-flex"><Button size="sm" onClick={() => { void navigator.clipboard?.writeText(shown); toast("Key copied."); }}>Copy</Button><Button size="sm" onClick={() => setShown(null)}>I have stored it</Button></span></div></Notice> : null}
      {error ? <Notice tone="danger" role="alert">{error} <button className="link-btn" onClick={() => void load()}>Retry</button></Notice> : null}
      {data && !data.keys.length ? <EmptyState title="No business keys yet">Create one when a system needs this data.</EmptyState> : null}
      {data?.keys.length ? <div className="table-wrap"><table className="data-table dense"><caption className="sr-only">Business API keys</caption><thead><tr><th>Name</th><th>Access</th><th>Key</th><th>Expires</th><th>Last used</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {data.keys.map((k) => { const expired = Date.parse(k.expiresAt) < Date.now(); return <tr key={k.id}><td>{k.name}</td><td>{k.scopes.map((s) => SCOPE_LABEL[s] ?? s).join("; ")}{k.sourceId ? ` (${k.sourceId})` : ""}</td><td><code>{k.prefix}</code></td><td>{formatShortDateTime(k.expiresAt)}</td><td>{k.lastUsedAt ? formatShortDateTime(k.lastUsedAt) : "Never"}</td><td>{k.revokedAt ? <Badge tone="neutral">Revoked</Badge> : expired ? <Badge tone="warn">Expired</Badge> : <Badge tone="accent">Active</Badge>}</td><td>{!k.revokedAt && !expired ? <Button size="sm" variant="danger" onClick={() => revoke(k)}>Revoke</Button> : null}</td></tr>; })}
      </tbody></table></div> : null}
      {creating && data ? <CreateDialog sources={data.sources} onClose={() => setCreating(false)} onCreated={(token) => { setCreating(false); setShown(token); void load(); }} /> : null}
    </section>
  );
}

function CreateDialog({ sources, onClose, onCreated }: { sources: { id: string; name: string }[]; onClose: () => void; onCreated: (token: string) => void }) {
  const [name, setName] = useState(""), [days, setDays] = useState("90"), [scopes, setScopes] = useState<string[]>(["vehicles:read"]), [sourceId, setSourceId] = useState(""), [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const auth = useReauth();
  const save = async () => {
    setBusy(true); setErrors({});
    const failed = await auth.confirm(password);
    if (failed) { setBusy(false); setErrors({ password: failed }); return; }
    const r = await call<{ key: string }>("/api/settings/business-keys", { method: "POST", body: JSON.stringify({ name, days: Number(days), scopes, sourceId: scopes.includes("sourcing:write") ? sourceId : undefined }) });
    setBusy(false);
    if (r.data.error?.code === "reauth_required") auth.expired();
    if (r.ok) { onCreated(r.data.key); return; }
    setErrors({ ...(r.data.error?.fields ?? {}), form: r.data.error?.message ?? "The key was not created." });
  };
  return (
    <Dialog open onClose={onClose} dirty title="Create business key" description="Choose only what the system needs. A key can be revoked at any time." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} loadingLabel="Creating key…" onClick={save}>Create key</Button></>}>
      <div className="stack">
        <FormSummary errors={errors.form ? { form: errors.form } : {}} />
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} help="Where it will be used, for example “Supplier feed”." />
        <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}><legend className="h3">Access</legend>
          {errors.scopes ? <div className="field-error" role="alert">{errors.scopes}</div> : null}
          {Object.entries(SCOPE_LABEL).map(([s, label]) => <Check key={s} label={label} checked={scopes.includes(s)} onChange={(on) => setScopes(on ? [...scopes, s] : scopes.filter((x) => x !== s))} />)}
        </fieldset>
        {scopes.includes("sourcing:write") ? <SelectField label="Approved source" value={sourceId} onChange={(e) => setSourceId(e.target.value)} placeholder="Choose a source" options={sources.map((s) => ({ value: s.id, label: s.name }))} error={errors.sourceId} help={sources.length ? undefined : "No source is approved yet. VandLabs approves sources for your dealership."} /> : null}
        <SelectField label="Expires" value={days} onChange={(e) => setDays(e.target.value)} options={[{ value: "30", label: "30 days" }, { value: "90", label: "90 days" }, { value: "180", label: "180 days" }, { value: "365", label: "1 year" }]} error={errors.days} />
        {auth.needsPassword ? <PasswordField label="Confirm your password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" error={errors.password} /> : null}
      </div>
    </Dialog>
  );
}
