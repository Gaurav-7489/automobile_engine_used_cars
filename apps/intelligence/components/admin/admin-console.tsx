"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { Brand } from "../brand";
import { Icon } from "../icons";
import { Dialog } from "../overlay";
import { Badge, Button, EmptyState, FormSummary, Kpi, Notice, PasswordField, TextField } from "../ui";

type Workspace = { tenantId: string; organization: string; dealership: string; createdAt: string; locations: number; vehicles: number; published: number; leads: number; members: number; owners: string; pendingInvites: number };
type Member = { userId: string; email: string; name: string; role: string; enabled: boolean; suspended: boolean; twoFactor: boolean; platformAdmin: boolean; createdAt: string };
type Problem = { error?: { message?: string; fields?: Record<string, string> } };

async function call<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T & Problem }> {
  try {
    const r = await fetch(url, { ...init, headers: init?.body ? { "content-type": "application/json" } : undefined });
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  } catch {
    return { ok: false, data: { error: { message: "We could not reach the server. Try again." } } as T & Problem };
  }
}

async function reauth(password: string): Promise<string | null> {
  const r = await call<object>("/api/auth/reauth", { method: "POST", body: JSON.stringify({ password }) });
  return r.ok ? null : r.data.error?.message ?? "That password is not correct.";
}

export function AdminConsole({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [link, setLink] = useState<{ title: string; url: string; expiresAt: string } | null>(null);
  const [reissue, setReissue] = useState<Workspace | null>(null);

  const load = useCallback(async () => {
    const r = await call<{ workspaces: Workspace[] }>("/api/admin/workspaces");
    if (r.ok) { setWorkspaces(r.data.workspaces); setError(""); } else setError(r.data.error?.message ?? "Workspaces could not be loaded.");
  }, []);
  useEffect(() => { void load(); }, [load]);

  const signOut = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); };
  const total = (key: keyof Workspace) => (workspaces ?? []).reduce((sum, w) => sum + Number(w[key]), 0);
  const showLink = (title: string, path: string, expiresAt: string) => setLink({ title, url: `${window.location.origin}${path}`, expiresAt });

  return (
    <div className="admin-shell">
      <header className="topbar" style={{ position: "static" }}>
        <Brand sub={false} />
        <span className="badge accent" style={{ marginLeft: 8 }}>Admin</span>
        <span className="spacer" />
        <Link href="/app/overview" className="btn btn-sm"><Icon name="grid" size={16} /><span className="hide-mobile">My dealership workspace</span></Link>
        <Button size="sm" onClick={signOut}><Icon name="logout" size={16} /><span className="hide-mobile">Sign out</span></Button>
      </header>
      <main className="main" id="content" tabIndex={-1}>
        <div className="main-inner stack">
          <div className="spread" style={{ flexWrap: "wrap", gap: 12 }}>
            <div><h1 className="h1" id="page-title" tabIndex={-1}>VandLabs admin console</h1><p className="muted">Signed in as {name} ({email}). Every dealership on the platform, from one sign-in.</p></div>
            <Button variant="primary" onClick={() => setCreating(true)}><Icon name="plus" size={18} />Add dealership</Button>
          </div>
          {link ? (
            <Notice tone="accent" role="alert">
              <div className="stack-sm">
                <strong>{link.title}</strong>
                <span>Send this link to the owner. It works once and expires {formatDateTime(link.expiresAt)}. It is not shown again.</span>
                <code style={{ wordBreak: "break-all" }}>{link.url}</code>
                <span className="row-flex"><Button size="sm" onClick={() => void navigator.clipboard?.writeText(link.url)}>Copy link</Button><Button size="sm" onClick={() => setLink(null)}>Done</Button></span>
              </div>
            </Notice>
          ) : null}
          {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
          <div className="kpi-grid">
            <Kpi label="Dealerships" value={workspaces ? workspaces.length : "—"} note="Workspaces on the platform" />
            <Kpi label="Stock in workspaces" value={workspaces ? total("vehicles") : "—"} note={workspaces ? `${total("published")} published on websites` : undefined} />
            <Kpi label="Leads" value={workspaces ? total("leads") : "—"} note="All dealerships" />
            <Kpi label="People with access" value={workspaces ? total("members") : "—"} note="Active memberships" />
          </div>
          <section className="card stack" aria-labelledby="ws-h">
            <h2 className="h2" id="ws-h">Dealerships</h2>
            {workspaces === null && !error ? <p className="muted">Loading.</p> : null}
            {workspaces && !workspaces.length ? <EmptyState title="No dealerships yet">Add the first dealership. Its owner gets a one-time link to set their own password.</EmptyState> : null}
            {workspaces && workspaces.length ? (
              <div className="table-wrap"><table className="data-table">
                <thead><tr><th>Dealership</th><th>Owner</th><th className="num">Branches</th><th className="num">Stock</th><th className="num">Leads</th><th className="num">People</th><th>Created</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>{workspaces.map((w) => (
                  <Fragment key={w.tenantId}>
                    <tr>
                      <td><span className="row-title">{w.dealership}</span><br /><span className="meta">{w.organization}</span></td>
                      <td>{w.owners || (w.pendingInvites ? <Badge tone="warn">Setup link sent</Badge> : <Badge tone="danger">No owner yet</Badge>)}</td>
                      <td className="num">{w.locations}</td><td className="num">{w.vehicles}</td><td className="num">{w.leads}</td><td className="num">{w.members}</td>
                      <td>{formatDateTime(w.createdAt)}</td>
                      <td><span className="row-flex" style={{ justifyContent: "flex-end" }}>
                        {w.members === 0 ? <Button size="sm" onClick={() => setReissue(w)}>New setup link</Button> : null}
                        <Button size="sm" aria-expanded={open === w.tenantId} onClick={() => setOpen(open === w.tenantId ? null : w.tenantId)}>{open === w.tenantId ? "Hide people" : "People"}</Button>
                      </span></td>
                    </tr>
                    {open === w.tenantId ? <tr><td colSpan={8}><Members tenantId={w.tenantId} /></td></tr> : null}
                  </Fragment>
                ))}</tbody>
              </table></div>
            ) : null}
          </section>
          <p className="meta">Dealer owners invite their own staff from Settings, Team inside their workspace. Every change made here is written to that dealership&rsquo;s audit log.</p>
        </div>
      </main>
      {creating ? <CreateDealership onClose={() => setCreating(false)} onCreated={(path, expiresAt) => { setCreating(false); showLink("Dealership created", path, expiresAt); void load(); }} /> : null}
      {reissue ? <ReissueInvite workspace={reissue} onClose={() => setReissue(null)} onDone={(path, expiresAt) => { setReissue(null); showLink("New owner setup link", path, expiresAt); void load(); }} /> : null}
    </div>
  );
}

function Members({ tenantId }: { tenantId: string }) {
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
  return (
    <Dialog open onClose={onClose} title={`${suspend ? "Suspend" : "Restore"} ${member.name}?`} description={suspend ? "They are signed out everywhere at once and cannot sign in to any dealership until restored." : "They can sign in again with their existing password."}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant={suspend ? "danger" : "primary"} loading={busy} loadingLabel="Saving" onClick={async () => {
        setBusy(true); setErrors({});
        const failed = await reauth(password);
        if (failed) { setBusy(false); setErrors({ password: failed }); return; }
        const r = await call<object>(`/api/admin/users/${member.userId}`, { method: "POST", body: JSON.stringify({ suspended: suspend, reason }) });
        setBusy(false);
        if (r.ok) onDone(); else setErrors(r.data.error?.fields ?? { form: r.data.error?.message ?? "Nothing was changed." });
      }}>{suspend ? "Suspend account" : "Restore account"}</Button></>}>
      <div className="stack">
        <FormSummary errors={errors.form ? { form: errors.form } : {}} />
        <TextField label={suspend ? "Reason (kept in the audit log)" : "Note (optional)"} value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />
        <PasswordField label="Confirm your password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" error={errors.password} />
      </div>
    </Dialog>
  );
}

type Branch = { name: string; city: string; state: string; phone: string };

function CreateDealership({ onClose, onCreated }: { onClose: () => void; onCreated: (path: string, expiresAt: string) => void }) {
  const [form, setForm] = useState({ organization: "", dealership: "", ownerName: "", ownerEmail: "" });
  const [branches, setBranches] = useState<Branch[]>([{ name: "Main branch", city: "", state: "", phone: "" }]);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const dirty = Object.values(form).some(Boolean);
  const setBranch = (i: number, patch: Partial<Branch>) => setBranches((list) => list.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  return (
    <Dialog open onClose={onClose} dirty={dirty} size="w640" title="Add dealership" description="Creates the dealership's private workspace and a one-time setup link for its owner. The owner chooses their own password."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} loadingLabel="Creating" onClick={async () => {
        setBusy(true); setErrors({});
        const failed = await reauth(password);
        if (failed) { setBusy(false); setErrors({ password: failed }); return; }
        const r = await call<{ setupPath: string; expiresAt: string }>("/api/admin/workspaces", { method: "POST", body: JSON.stringify({ ...form, locations: branches }) });
        setBusy(false);
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
        <PasswordField label="Confirm your password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" error={errors.password} />
      </div>
    </Dialog>
  );
}

function ReissueInvite({ workspace, onClose, onDone }: { workspace: Workspace; onClose: () => void; onDone: (path: string, expiresAt: string) => void }) {
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onClose={onClose} title={`New setup link for ${workspace.dealership}`} description="Use this when the first link expired or went to the wrong address. Any earlier unused link stops working."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} loadingLabel="Creating" onClick={async () => {
        setBusy(true); setErrors({});
        const failed = await reauth(password);
        if (failed) { setBusy(false); setErrors({ password: failed }); return; }
        const r = await call<{ setupPath: string; expiresAt: string }>(`/api/admin/workspaces/${workspace.tenantId}/owner-invite`, { method: "POST", body: JSON.stringify({ ownerName, ownerEmail }) });
        setBusy(false);
        if (r.ok) onDone(r.data.setupPath, r.data.expiresAt); else setErrors({ ...(r.data.error?.fields ?? {}), form: r.data.error?.message ?? "Nothing was changed." });
      }}>Create link</Button></>}>
      <div className="stack">
        <FormSummary errors={errors.form ? { form: errors.form } : {}} />
        <TextField label="Owner's name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
        <TextField label="Owner's email" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} error={errors.ownerEmail} />
        <PasswordField label="Confirm your password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" error={errors.password} />
      </div>
    </Dialog>
  );
}
