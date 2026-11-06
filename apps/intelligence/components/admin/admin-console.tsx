"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "../icons";
import { Dialog } from "../overlay";
import { Badge, Button, FormSummary, Notice, PasswordField, TextField } from "../ui";
import { call, useReauth } from "./shared";

export type Workspace = { tenantId: string; organization: string; dealership: string; createdAt: string; locations: number; vehicles: number; published: number; leads: number; members: number; owners: string; pendingInvites: number };
type Member = { userId: string; email: string; name: string; role: string; enabled: boolean; suspended: boolean; twoFactor: boolean; platformAdmin: boolean; createdAt: string };
export function Members({ tenantId }: { tenantId: string }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<Member | null>(null);
  const load = useCallback(async () => {
    const r = await call<{ members: Member[] }>(`/api/admin/workspaces/${tenantId}/members`);
    if (r.ok) setMembers(r.data.members); else setError(r.data.error?.message ?? "People could not be loaded.");
  }, [tenantId]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <Notice tone="danger" role="alert">{error}</Notice>;
  if (!members) return <p className="muted">Loading people.</p>;
  if (!members.length) return <p className="muted">Nobody has joined this workspace yet.</p>;
  return (
    <>
      <table className="data-table dense"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Two-factor</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{members.map((m) => (
          <tr key={m.userId}><td>{m.name}{m.platformAdmin ? <> <Badge tone="accent">VandLabs admin</Badge></> : null}</td><td>{m.email}</td><td style={{ textTransform: "capitalize" }}>{m.role}</td>
            <td>{m.twoFactor ? "On" : "Off"}</td>
            <td>{m.suspended ? <Badge tone="danger">Suspended</Badge> : m.enabled ? <Badge tone="accent">Active</Badge> : <Badge>Removed by owner</Badge>}</td>
            <td>{m.platformAdmin ? null : <Button size="sm" variant={m.suspended ? "secondary" : "danger"} onClick={() => setTarget(m)}>{m.suspended ? "Restore" : "Suspend"}</Button>}</td></tr>
        ))}</tbody></table>
      {target ? <SuspendDialog member={target} onClose={() => setTarget(null)} onDone={() => { setTarget(null); void load(); }} /> : null}
    </>
  );
}

function SuspendDialog({ member, onClose, onDone }: { member: Member; onClose: () => void; onDone: () => void }) {
  const suspend = !member.suspended;
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const auth = useReauth();
  return (
    <Dialog open onClose={onClose} title={`${suspend ? "Suspend" : "Restore"} ${member.name}?`} description={suspend ? "They are signed out everywhere at once and cannot sign in to any dealership until restored." : "They can sign in again with their existing password."}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant={suspend ? "danger" : "primary"} loading={busy} loadingLabel="Saving" onClick={async () => {
        setBusy(true); setErrors({});
        const failed = await auth.confirm(password);
        if (failed) { setBusy(false); setErrors({ password: failed }); return; }
        const r = await call<object>(`/api/admin/users/${member.userId}`, { method: "POST", body: JSON.stringify({ suspended: suspend, reason }) });
        setBusy(false);
        if (r.data.error?.code === "reauth_required") auth.expired();
        if (r.ok) onDone(); else setErrors(r.data.error?.fields ?? { form: r.data.error?.message ?? "Nothing was changed." });
      }}>{suspend ? "Suspend account" : "Restore account"}</Button></>}>
      <div className="stack">
        <FormSummary errors={errors.form ? { form: errors.form } : {}} />
        <TextField label={suspend ? "Reason (kept in the audit log)" : "Note (optional)"} value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />
        {auth.needsPassword ? <PasswordField label="Confirm your password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" error={errors.password} /> : <Notice>Your identity was confirmed a moment ago.</Notice>}
      </div>
    </Dialog>
  );
}

type Branch = { name: string; city: string; state: string; phone: string };

export function CreateDealership({ onClose, onCreated }: { onClose: () => void; onCreated: (path: string, expiresAt: string) => void }) {
  const [form, setForm] = useState({ organization: "", dealership: "", ownerName: "", ownerEmail: "" });
  const [branches, setBranches] = useState<Branch[]>([{ name: "Main branch", city: "", state: "", phone: "" }]);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const auth = useReauth();
  const dirty = Object.values(form).some(Boolean);
  const setBranch = (i: number, patch: Partial<Branch>) => setBranches((list) => list.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  return (
    <Dialog open onClose={onClose} dirty={dirty} size="w640" title="Add dealership" description="Creates the dealership's private workspace and a one-time setup link for its owner. The owner chooses their own password."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} loadingLabel="Creating dealership…" onClick={async () => {
        setBusy(true); setErrors({});
        const failed = await auth.confirm(password);
        if (failed) { setBusy(false); setErrors({ password: failed }); return; }
        const r = await call<{ setupPath: string; expiresAt: string }>("/api/admin/workspaces", { method: "POST", body: JSON.stringify({ ...form, locations: branches }) });
        setBusy(false);
        if (r.data.error?.code === "reauth_required") auth.expired();
        if (r.ok) onCreated(r.data.setupPath, r.data.expiresAt);
        else setErrors({ ...(r.data.error?.fields ?? {}), form: r.data.error?.message ?? "Nothing was created." });
      }}>Create dealership</Button></>}>
      <div className="stack">
        <FormSummary errors={errors.form ? { form: errors.form } : {}} />
        <div className="form-grid">
          <TextField label="Registered business name" required value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} error={errors.organization} placeholder="Sharma Motors Pvt Ltd" />
          <TextField label="Dealership name" required value={form.dealership} onChange={(e) => setForm({ ...form, dealership: e.target.value })} error={errors.dealership} placeholder="Sharma Motors" />
          <TextField label="Owner's name" required value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} error={errors.ownerName} />
          <TextField label="Owner's email" required type="email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} error={errors.ownerEmail} />
        </div>
        <h3 className="h3">Branches</h3>
        {errors.locations ? <div className="field-error" role="alert">{errors.locations}</div> : null}
        {branches.map((b, i) => (
          <div key={i} className="card tight stack-sm">
            <div className="form-grid">
              <TextField label="Branch name" required value={b.name} onChange={(e) => setBranch(i, { name: e.target.value })} error={errors[`locations.${i}`]} />
              <TextField label="Phone" value={b.phone} onChange={(e) => setBranch(i, { phone: e.target.value })} />
              <TextField label="City" required value={b.city} onChange={(e) => setBranch(i, { city: e.target.value })} />
              <TextField label="State" required value={b.state} onChange={(e) => setBranch(i, { state: e.target.value })} />
            </div>
            {branches.length > 1 ? <div><Button size="sm" onClick={() => setBranches(branches.filter((_, j) => j !== i))}>Remove branch</Button></div> : null}
          </div>
        ))}
        <div><Button size="sm" onClick={() => setBranches([...branches, { name: "", city: "", state: "", phone: "" }])}><Icon name="plus" size={16} />Add another branch</Button></div>
        {auth.needsPassword ? <PasswordField label="Confirm your password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" error={errors.password} /> : <Notice>Your identity was confirmed a moment ago.</Notice>}
      </div>
    </Dialog>
  );
}

export function ReissueInvite({ workspace, onClose, onDone }: { workspace: Workspace; onClose: () => void; onDone: (path: string, expiresAt: string) => void }) {
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const auth = useReauth();
  return (
    <Dialog open onClose={onClose} title={`New setup link for ${workspace.dealership}`} description="Use this when the first link expired or went to the wrong address. Any earlier unused link stops working."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} loadingLabel="Creating" onClick={async () => {
        setBusy(true); setErrors({});
        const failed = await auth.confirm(password);
        if (failed) { setBusy(false); setErrors({ password: failed }); return; }
        const r = await call<{ setupPath: string; expiresAt: string }>(`/api/admin/workspaces/${workspace.tenantId}/owner-invite`, { method: "POST", body: JSON.stringify({ ownerName, ownerEmail }) });
        setBusy(false);
        if (r.data.error?.code === "reauth_required") auth.expired();
        if (r.ok) onDone(r.data.setupPath, r.data.expiresAt); else setErrors({ ...(r.data.error?.fields ?? {}), form: r.data.error?.message ?? "Nothing was changed." });
      }}>Create link</Button></>}>
      <div className="stack">
        <FormSummary errors={errors.form ? { form: errors.form } : {}} />
        <TextField label="Owner's name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
        <TextField label="Owner's email" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} error={errors.ownerEmail} />
        {auth.needsPassword ? <PasswordField label="Confirm your password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" error={errors.password} /> : <Notice>Your identity was confirmed a moment ago.</Notice>}
      </div>
    </Dialog>
  );
}
