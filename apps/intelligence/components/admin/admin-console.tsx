"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "../icons";
import { Dialog } from "../overlay";
import { Badge, Button, FormSummary, Notice, TextField } from "../ui";
import { call, useReauth, ConfirmIdentity } from "./shared";

export type Workspace = { tenantId: string; organization: string; dealership: string; createdAt: string; locations: number; vehicles: number; published: number; leads: number; members: number; owners: string; pendingInvites: number; pendingOwner?: string };
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
        <ConfirmIdentity needsPassword={auth.needsPassword} password={password} onPassword={setPassword} error={errors.password} />
      </div>
    </Dialog>
  );
}

type Branch = { name: string; city: string; state: string; phone: string };

export function CreateDealership({ onClose, onCreated }: { onClose: () => void; onCreated: (ownerEmail: string, signInUrl: string) => void }) {
  const [form, setForm] = useState({ organization: "", dealership: "", ownerName: "", ownerEmail: "" });
  const [branches, setBranches] = useState<Branch[]>([{ name: "Main branch", city: "", state: "", phone: "" }]);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const auth = useReauth();
  const dirty = Object.values(form).some(Boolean);
  const setBranch = (i: number, patch: Partial<Branch>) => setBranches((list) => list.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  return (
    <Dialog open onClose={onClose} dirty={dirty} size="w640" title="Add dealership" description="Creates the dealership's private workspace and assigns its owner's Google account. The owner signs in with Continue with Google; no link or password."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} loadingLabel="Creating dealership…" onClick={async () => {
        setBusy(true); setErrors({});
        const failed = await auth.confirm(password);
        if (failed) { setBusy(false); setErrors({ password: failed }); return; }
        const r = await call<{ ownerEmail: string; signInUrl: string }>("/api/admin/workspaces", { method: "POST", body: JSON.stringify({ ...form, locations: branches }) });
        setBusy(false);
        if (r.data.error?.code === "reauth_required") auth.expired();
        if (r.ok) onCreated(r.data.ownerEmail, r.data.signInUrl);
        else setErrors({ ...(r.data.error?.fields ?? {}), form: r.data.error?.message ?? "Nothing was created." });
      }}>Create dealership</Button></>}>
      <div className="stack">
        <FormSummary errors={errors.form ? { form: errors.form } : {}} />
        <div className="form-grid">
          <TextField label="Registered business name" required value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} error={errors.organization} placeholder="Sharma Motors Pvt Ltd" />
          <TextField label="Dealership name" required value={form.dealership} onChange={(e) => setForm({ ...form, dealership: e.target.value })} error={errors.dealership} placeholder="Sharma Motors" />
          <TextField label="Owner's name" required value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} error={errors.ownerName} />
          <TextField label="Owner's Google email" required type="email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} error={errors.ownerEmail} help="The Google account the owner will sign in with, for example name@gmail.com." />
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
        <ConfirmIdentity needsPassword={auth.needsPassword} password={password} onPassword={setPassword} error={errors.password} />
      </div>
    </Dialog>
  );
}

export function ReissueInvite({ workspace, onClose, onDone }: { workspace: Workspace; onClose: () => void; onDone: (ownerEmail: string, signInUrl: string) => void }) {
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const auth = useReauth();
  return (
    <Dialog open onClose={onClose} title={`Change owner for ${workspace.dealership}`} description="Before the owner has signed in, you can correct the Google account assigned as owner. The earlier assignment stops working."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} loadingLabel="Creating" onClick={async () => {
        setBusy(true); setErrors({});
        const failed = await auth.confirm(password);
        if (failed) { setBusy(false); setErrors({ password: failed }); return; }
        const r = await call<{ ownerEmail: string; signInUrl: string }>(`/api/admin/workspaces/${workspace.tenantId}/owner-invite`, { method: "POST", body: JSON.stringify({ ownerName, ownerEmail }) });
        setBusy(false);
        if (r.data.error?.code === "reauth_required") auth.expired();
        if (r.ok) onDone(r.data.ownerEmail, r.data.signInUrl); else setErrors({ ...(r.data.error?.fields ?? {}), form: r.data.error?.message ?? "Nothing was changed." });
      }}>Assign owner</Button></>}>
      <div className="stack">
        <FormSummary errors={errors.form ? { form: errors.form } : {}} />
        <TextField label="Owner's name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
        <TextField label="Owner's Google email" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} error={errors.ownerEmail} />
        <ConfirmIdentity needsPassword={auth.needsPassword} password={password} onPassword={setPassword} error={errors.password} />
      </div>
    </Dialog>
  );
}

type WebsiteLink = { id: string; site: string; prefix: string; createdAt: string; expiresAt: string; revokedAt: string | null; lastUsedAt: string | null; webhooks: boolean };

/**
 * VandLabs links a dealership website to its workspace: a website key shown once, set on the website's own deployment as
 * VANDLABS_API_KEY. The dealer never enters a password into their website. Unlinking stops it at once.
 */
export function WebsiteLinks({ workspace, onClose }: { workspace: Workspace; onClose: () => void }) {
  const [list, setList] = useState<WebsiteLink[] | null>(null);
  const [siteUrl, setSiteUrl] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ key: string; site: string; webhooks: boolean } | null>(null);
  const auth = useReauth();
  const load = useCallback(async () => {
    const r = await call<{ websites: WebsiteLink[] }>(`/api/admin/workspaces/${workspace.tenantId}/websites`);
    setList(r.ok ? r.data.websites : []);
  }, [workspace.tenantId]);
  useEffect(() => { void load(); }, [load]);
  const unlink = async (id: string) => {
    setErrors({});
    const failed = await auth.confirm(password);
    if (failed) { setErrors({ password: failed }); return; }
    const r = await call<object>(`/api/admin/workspaces/${workspace.tenantId}/websites`, { method: "DELETE", body: JSON.stringify({ keyId: id }) });
    if (r.data.error?.code === "reauth_required") auth.expired();
    if (!r.ok) setErrors({ form: r.data.error?.message ?? "Nothing was changed." });
    void load();
  };
  return (
    <Dialog open onClose={onClose} size="w640" title={`Website for ${workspace.dealership}`} description="Link the dealership's VandLabs website so it shows this workspace's published cars and sends enquiries here."
      footer={<><Button onClick={onClose}>Done</Button>{issued ? null : <Button variant="primary" loading={busy} loadingLabel="Linking" onClick={async () => {
        setBusy(true); setErrors({});
        const failed = await auth.confirm(password);
        if (failed) { setBusy(false); setErrors({ password: failed }); return; }
        const r = await call<{ key: string; site: string; webhooks: boolean }>(`/api/admin/workspaces/${workspace.tenantId}/websites`, { method: "POST", body: JSON.stringify({ siteUrl }) });
        setBusy(false);
        if (r.data.error?.code === "reauth_required") auth.expired();
        if (r.ok) { setIssued(r.data); void load(); } else setErrors({ ...(r.data.error?.fields ?? {}), form: r.data.error?.message ?? "Nothing was changed." });
      }}>Link website</Button>}</>}>
      <div className="stack">
        <FormSummary errors={errors.form ? { form: errors.form } : {}} />
        {issued ? (
          <section className="card stack-sm" role="alert">
            <strong>Set these on the website&apos;s hosting (Vercel → Settings → Environment Variables), then redeploy it:</strong>
            <code className="adm-link">VANDLABS_API_URL={typeof window === "undefined" ? "" : window.location.origin}</code>
            <code className="adm-link">VANDLABS_API_KEY={issued.key}</code>
            <p className="meta">The key is shown once and only works for this dealership&apos;s website ({issued.site}). Linking again replaces it. {issued.webhooks ? "Stock changes are pushed to the website as they happen." : "This address cannot receive instant stock updates (it is not public https); the website refreshes every few minutes."}</p>
            <div><Button size="sm" onClick={() => { void navigator.clipboard?.writeText(issued.key); }}><Icon name="copy" size={16} />Copy key</Button></div>
          </section>
        ) : <TextField label="Website address" type="url" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} error={errors.siteUrl} placeholder="https://www.dealership.in" />}
        {list === null ? <p className="muted">Loading…</p> : list.length === 0 ? <p className="muted">No website linked yet.</p> : (
          <table className="data-table dense"><thead><tr><th>Website</th><th>Key</th><th>Last used</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{list.map((k) => <tr key={k.id}><td>{k.site}</td><td><code>{k.prefix}…</code></td><td>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString("en-IN") : "Never"}</td><td>{k.revokedAt ? <Badge>Unlinked</Badge> : <Badge tone="accent">Linked</Badge>}</td><td>{k.revokedAt ? null : <Button size="sm" onClick={() => void unlink(k.id)}>Unlink</Button>}</td></tr>)}</tbody>
          </table>
        )}
        <ConfirmIdentity needsPassword={auth.needsPassword} password={password} onPassword={setPassword} error={errors.password} />
      </div>
    </Dialog>
  );
}

type AccessRequest = { id: string; email: string; name: string; businessName: string; dealershipName: string; phone: string; city: string; state: string; message: string | null; status: string; createdAt: string };

/** Google accounts that signed in without access and asked for a dealership workspace. Approving creates it with them as owner. */
export function AccessRequests({ onApproved }: { onApproved: (ownerEmail: string, signInUrl: string) => void }) {
  const [list, setList] = useState<AccessRequest[] | null>(null);
  const [deciding, setDeciding] = useState<{ request: AccessRequest; approve: boolean } | null>(null);
  const load = useCallback(async () => {
    const r = await call<{ requests: AccessRequest[] }>("/api/admin/access-requests");
    setList(r.ok ? r.data.requests : []);
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (!list || list.length === 0) return null;
  return (
    <section className="card stack-sm" aria-labelledby="access-h">
      <div className="spread"><h2 className="h3" id="access-h">Access requests</h2><Badge tone="warn">{list.length} waiting</Badge></div>
      <p className="meta">People who signed in with Google but have no access. Approving creates their dealership with their Google account as owner.</p>
      <div className="table-wrap fit"><table className="data-table dense" aria-label="Access requests">
        <thead><tr><th>Person</th><th>Dealership</th><th className="only-desktop">Location</th><th className="only-desktop">Sent</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{list.map((r) => (
          <tr key={r.id}>
            <td><span className="row-title">{r.name}</span><span className="sub">{r.email} · {r.phone}</span></td>
            <td><span className="row-title">{r.dealershipName}</span><span className="sub">{r.businessName}{r.message ? ` · “${r.message}”` : ""}</span></td>
            <td className="only-desktop">{r.city}, {r.state}</td>
            <td className="only-desktop">{new Date(r.createdAt).toLocaleString("en-IN")}</td>
            <td><div className="row-flex"><Button size="sm" variant="primary" onClick={() => setDeciding({ request: r, approve: true })}>Approve</Button><Button size="sm" onClick={() => setDeciding({ request: r, approve: false })}>Decline</Button></div></td>
          </tr>
        ))}</tbody>
      </table></div>
      {deciding ? <DecideAccess request={deciding.request} approve={deciding.approve} onClose={() => setDeciding(null)} onDone={(url) => { const r = deciding.request; setDeciding(null); void load(); if (url) onApproved(r.email, url); }} /> : null}
    </section>
  );
}

function DecideAccess({ request, approve, onClose, onDone }: { request: AccessRequest; approve: boolean; onClose: () => void; onDone: (signInUrl: string | null) => void }) {
  const [businessName, setBusinessName] = useState(request.businessName);
  const [dealershipName, setDealershipName] = useState(request.dealershipName);
  const [note, setNote] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const auth = useReauth();
  return (
    <Dialog open onClose={onClose} title={approve ? `Approve ${request.dealershipName}?` : `Decline ${request.name}'s request?`}
      description={approve ? `Creates the dealership with one branch in ${request.city}, ${request.state}. ${request.email} becomes the owner and signs in with Google.` : "They are not given access. They can send a new request later."}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant={approve ? "primary" : "danger"} loading={busy} loadingLabel={approve ? "Creating dealership" : "Declining"} onClick={async () => {
        setBusy(true); setErrors({});
        const failed = await auth.confirm(password);
        if (failed) { setBusy(false); setErrors({ password: failed }); return; }
        const r = await call<{ signInUrl: string }>(`/api/admin/access-requests/${request.id}`, { method: "POST", body: JSON.stringify({ decision: approve ? "approve" : "decline", note, businessName, dealershipName }) });
        setBusy(false);
        if (r.data.error?.code === "reauth_required") auth.expired();
        if (r.ok) onDone(approve ? r.data.signInUrl : null); else setErrors({ ...(r.data.error?.fields ?? {}), form: r.data.error?.message ?? "Nothing was changed." });
      }}>{approve ? "Approve and create" : "Decline"}</Button></>}>
      <div className="stack">
        <FormSummary errors={errors.form ? { form: errors.form } : {}} />
        {approve ? <>
          <TextField label="Registered business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} error={errors.businessName} />
          <TextField label="Dealership name" value={dealershipName} onChange={(e) => setDealershipName(e.target.value)} />
        </> : null}
        <TextField label={approve ? "Note (optional)" : "Reason (optional, kept with the request)"} value={note} onChange={(e) => setNote(e.target.value)} />
        <ConfirmIdentity needsPassword={auth.needsPassword} password={password} onPassword={setPassword} error={errors.password} />
      </div>
    </Dialog>
  );
}
