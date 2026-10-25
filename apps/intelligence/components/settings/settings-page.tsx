"use client";

import { notFound, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { changeRole, connectIntegration, disconnectIntegration, inviteMember, removeMember, revokeSessions, saveBranch, saveBusiness, scopeText, setNotification, setPolicy, testConnection } from "@/lib/actions";
import type { Integration, IntegrationState, Role } from "@/lib/domain";
import { formatDateTime, formatShortDateTime } from "@/lib/format";
import { can as canDo, ROLE_LABEL, ROLE_SUMMARY, ROLES } from "@/lib/permissions";
import { downloadCsv } from "@/lib/export";
import { Dialog, Drawer } from "../overlay";
import { Panel } from "../panel";
import { useToast } from "../toast";
import { Badge, Button, Check, EmptyState, FormSummary, Notice, PageHead, PasswordField, SelectField, TextField } from "../ui";
import { useScopedHref, useWorkspace } from "../workspace";

export const SECTIONS = [
  { key: "business", label: "Business" }, { key: "branches", label: "Branches" }, { key: "team", label: "Team & roles" }, { key: "security", label: "Security" }, { key: "integrations", label: "Integrations" },
  { key: "billing", label: "Billing" }, { key: "api", label: "API access" }, { key: "notifications", label: "Notifications" }, { key: "audit", label: "Audit" },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];

async function reauth(password: string): Promise<string | null> {
  try {
    const r = await fetch("/api/auth/reauth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    if (r.ok) return null;
    const body = await r.json().catch(() => ({}));
    return body?.error?.message ?? "Re-authentication failed.";
  } catch { return "We could not reach the server. Try again."; }
}

export function SettingsPage({ section }: { section: string }) {
  const key = SECTIONS.find((s) => s.key === section)?.key;
  if (!key) notFound();
  return <Settings section={key} />;
}

function Settings({ section }: { section: SectionKey }) {
  const href = useScopedHref();
  const router = useRouter();
  const current = SECTIONS.find((s) => s.key === section)!;
  return (
    <div className="page">
      <PageHead title={section === "integrations" ? "Settings / Integrations" : `Settings / ${current.label}`} lead="Access, configuration and connection health are permissioned.">
        <p className="meta" style={{ marginTop: 4 }}>Settings &gt; {current.label}</p>
      </PageHead>
      <div className="settings-grid">
        <nav className="settings-nav only-desktop" aria-label="Settings sections">
          {SECTIONS.map((s) => <Link key={s.key} href={href(`/app/settings/${s.key}`)} aria-current={s.key === section ? "page" : undefined}>{s.label}</Link>)}
        </nav>
        <div className="settings-tabs only-mobile"><SelectField label="Section" value={section} onChange={(e) => router.push(href(`/app/settings/${e.target.value}`))} options={SECTIONS.map((s) => ({ value: s.key, label: s.label }))} /></div>
        <div className="settings-content" id="settings-content">
          {section === "business" ? <Business /> : null}
          {section === "branches" ? <Branches /> : null}
          {section === "team" ? <Team /> : null}
          {section === "security" ? <Security /> : null}
          {section === "integrations" ? <Integrations /> : null}
          {section === "billing" ? <Billing /> : null}
          {section === "api" ? <ApiAccess /> : null}
          {section === "notifications" ? <Notifications /> : null}
          {section === "audit" ? <Audit /> : null}
        </div>
      </div>
    </div>
  );
}

/* Integrations ------------------------------------------------------------------- */

const STATE_TONE: Record<IntegrationState, "accent" | "warn" | "danger" | "neutral"> = { Connected: "accent", Degraded: "warn", Expired: "danger", Disconnected: "neutral", "Not configured": "neutral", Authorising: "warn" };

function Integrations() {
  const { state, can, run, demoState } = useWorkspace();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState("feed-a");
  const [connect, setConnect] = useState<Integration | null>(null);
  const [disc, setDisc] = useState<Integration | null>(null);
  const [rows, setRows] = useState<Integration | null>(null);
  const [testing, setTesting] = useState(false);
  const [health, setHealth] = useState<{ ok: boolean; message: string } | null>(null);
  const selected = state.integrations.find((i) => i.id === selectedId) ?? state.integrations[0];
  const manage = can("settings.integrations");
  useEffect(() => setHealth(null), [selectedId]);

  const test = async (i: Integration) => {
    setTesting(true); setHealth(null);
        const r = run((s, a) => testConnection(s, a, i.id));
    setTesting(false);
    if (!r.ok) { toast(r.message, "error"); return; }
    setHealth({ ok: r.healthy, message: r.message });
  };

  return (
    <Panel title="Integrations" rows={6} partialFail>
      <div className="stack" style={{ gap: 24 }}>
        {state.integrations.every((i) => i.state === "Not configured") ? (
          <EmptyState title="No connections yet" actions={manage ? <Button variant="primary" onClick={() => setConnect(state.integrations[0])}>Connect</Button> : undefined}>Supported authorised connector types: licensed listing feeds, advertising accounts and inventory publishing. No contractual source? Request an integration rather than assuming a connector is ready.</EmptyState>
        ) : null}
        <div className="int-cards" role="list">
          {state.integrations.map((i) => (
            <section key={i.id} role="listitem" className={`card int-card ${selected.id === i.id ? "selected" : ""}`} aria-labelledby={`int-${i.id}`}>
              <h2 className="h3" id={`int-${i.id}`}>{i.name}</h2>
              <div><Badge tone={STATE_TONE[i.state]}>{i.state}</Badge></div>
              <p>{i.state === "Connected" && i.lastSuccessAt ? `Last success ${formatDateTime(i.lastSuccessAt).split(" / ")[1].replace(" IST", "")} IST` : i.detail}</p>
              <p className="meta">{i.scopes}</p>
              <Button variant={i.state === "Not configured" || i.state === "Disconnected" ? "primary" : "secondary"} className="btn-block" disabled={!manage} reason={!manage ? "Requires Owner access to change connections." : undefined} onClick={() => { setSelectedId(i.id); if (i.state === "Not configured" || i.state === "Disconnected" || i.state === "Expired") setConnect(i); }}>{i.state === "Not configured" || i.state === "Disconnected" ? "Connect" : i.state === "Expired" ? "Reconnect" : "Configure"}</Button>
            </section>
          ))}
        </div>

        <section className="card" aria-labelledby="sel-title">
          <h2 className="h3" id="sel-title">Selected integration / {selected.name.replace("Licensed feed", "Feed")}</h2>
          <p className="muted mt-4">Permitted branch: {selected.branchScope} / Cadence: {selected.cadence} / Freshness SLA: {selected.freshnessSla}</p>
          <p className="mt-4">{selected.received} received / {selected.rejected} rejected / Job {selected.lastJob} / {selected.state === "Not configured" ? "Not connected" : selected.state}</p>
          {health ? <div className="mt-4"><Notice tone={health.ok ? "accent" : "warn"} role="status">{health.message}</Notice></div> : null}
          <p className="meta mt-2">Connected is allowed only after a successful server-side test. Stale health becomes Unknown or Degraded.</p>
          <div className="row-flex mt-4 int-actions">
            <Button variant="primary" onClick={() => test(selected)} loading={testing} loadingLabel="Testing" disabled={!manage || demoState === "loading"} reason={!manage ? "Requires Owner access." : undefined}>Test connection</Button>
            <Button onClick={() => setRows(selected)}>Inspect rejected rows</Button>
            <Button variant="danger" onClick={() => setDisc(selected)} disabled={!manage || selected.state === "Not configured" || selected.state === "Disconnected"}>Disconnect</Button>
          </div>
        </section>

        <div className="table-wrap">
          <table className="data-table" aria-label="Sync log"><thead><tr><th style={{ width: 200 }}>Time / IST</th><th style={{ width: 150 }}>Job</th><th className="num" style={{ width: 150 }}>Received</th><th className="num" style={{ width: 156 }}>Rejected</th><th>Status</th></tr></thead>
            <tbody>{selected.logs.length ? selected.logs.map((l) => <tr key={l.id} style={{ height: 56 }}><td><span className="row-title">{formatShortDateTime(l.at)}</span></td><td>{l.job}</td><td className="num">{l.received}</td><td className="num">{l.rejected}</td><td><button type="button" className="link-btn" style={{ color: "var(--text)" }} onClick={() => setRows({ ...selected, logs: [l] })}>{l.status === "Partial" ? "Partial / inspect" : l.status === "Failed" ? "Failed / inspect" : "Success"}</button></td></tr>) : <tr><td colSpan={5} className="muted">No sync jobs yet.</td></tr>}</tbody></table>
        </div>
        <p className="footnote">Credentials are masked. Only providers with real credentials and a passing health check show as Connected.</p>
      </div>

      <ConnectDialog integration={connect} onClose={() => setConnect(null)} onConnect={(accepted) => { const r = run((s, a) => connectIntegration(s, a, connect!.id, accepted)); if (!r.ok) return r.fields?.scopes ?? r.message; toast(`${connect!.name} connected after a successful first health check.`); setConnect(null); return null; }} />
      <Dialog open={Boolean(disc)} onClose={() => setDisc(null)} title={`Disconnect ${disc?.name ?? ""}`} description="Disconnect revokes the token server-side and preserves the audit trail." footer={<><Button onClick={() => setDisc(null)}>Keep connected</Button><Button variant="danger" onClick={() => { const r = run((s, a) => disconnectIntegration(s, a, disc!.id)); if (r.ok) toast(`${disc!.name} disconnected.${r.affectedCampaigns.length ? ` Pause requested for ${r.affectedCampaigns.join(", ")}.` : ""}`); else toast(r.message, "error"); setDisc(null); }}>Disconnect {disc?.name}</Button></>}>
        <Notice tone="warn">Affected: syncs from this connection stop{disc?.id === "ads" ? "; active or approved campaigns pause or return to draft" : ""}. Reconnecting later needs a new authorisation.</Notice>
      </Dialog>
      <Drawer open={Boolean(rows)} onClose={() => setRows(null)} size="w560" title="Rejected rows" description={rows?.name} footer={<><Button onClick={() => setRows(null)}>Close</Button><Button variant="primary" onClick={() => { toast("Retry queued for rejected rows only. It is idempotent: accepted rows are not touched."); setRows(null); }} disabled={!manage}>Retry rejected rows</Button></>}>
        {rows?.logs.flatMap((l) => (l.rejectedRows ?? []).map((r) => ({ ...r, job: l.job }))).length ? (
          <div className="table-wrap fit"><table className="data-table dense"><thead><tr><th>Job</th><th className="num">Row</th><th>Reason</th></tr></thead><tbody>{rows.logs.flatMap((l) => (l.rejectedRows ?? []).map((r) => <tr key={`${l.job}-${r.row}`}><td>{l.job}</td><td className="num">{r.row}</td><td>{r.reason}</td></tr>))}</tbody></table></div>
        ) : <p className="muted">No rejected rows in the selected jobs.</p>}
      </Drawer>
    </Panel>
  );
}

function ConnectDialog({ integration, onClose, onConnect }: { integration: Integration | null; onClose: () => void; onConnect: (accepted: boolean) => string | null }) {
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setAccepted(false); setError(""); setBusy(false); }, [integration]);
  if (!integration) return null;
  return (
    <Dialog open onClose={onClose} title={`Connect ${integration.name}`} description="Review the requested scopes and branches before authorising." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} loadingLabel="Authorising" onClick={async () => { setBusy(true); await new Promise((r) => window.setTimeout(r, 600)); const e = onConnect(accepted); setBusy(false); if (e) setError(e); }}>Authorise and connect</Button></>}>
      <dl className="kv"><div><dt>Requested scopes</dt><dd style={{ maxWidth: 300 }}>{scopeText(integration.id)}</dd></div><div><dt>Branches</dt><dd>{integration.branchScope}</dd></div></dl>
      <Check label="I have reviewed the scopes and want to connect" checked={accepted} onChange={setAccepted} />
      {error ? <div className="field-error" role="alert">{error}</div> : null}
      <p className="meta">Setup required: provider connections need credentials that VandLabs enables per workspace. Until then connecting is refused, and nothing is simulated.</p>
    </Dialog>
  );
}

/* Business ----------------------------------------------------------------------- */

function Business() {
  const { state, can, run } = useWorkspace();
  const toast = useToast();
  const admin = can("settings.admin");
  const [form, setForm] = useState({ displayName: state.tenant.displayName, legalName: state.tenant.legalName, gstin: state.tenant.gstin, timezone: state.tenant.timezone });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(form) !== JSON.stringify({ displayName: state.tenant.displayName, legalName: state.tenant.legalName, gstin: state.tenant.gstin, timezone: state.tenant.timezone });
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  return (
    <section className="card stack" aria-labelledby="biz-h">
      <div className="spread"><h2 className="h2" id="biz-h">Business</h2>{admin && dirty ? <Button variant="primary" onClick={() => { const r = run((s, a) => saveBusiness(s, a, form)); if (!r.ok) { setErrors(r.fields ?? { form: r.message }); return; } setErrors({}); toast("Business profile saved."); }}>Save</Button> : null}</div>
      {!admin ? <Notice tone="warn" role="status">Business settings are read-only for your role. Requires Owner access.</Notice> : null}
      <FormSummary errors={errors} />
      <div className="form-grid">
        <TextField label="Display name" required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} error={errors.displayName} disabled={!admin} />
        <TextField label="Legal business name" required value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} error={errors.legalName} disabled={!admin} />
        <TextField label="GSTIN (optional)" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} error={errors.gstin} disabled={!admin} placeholder="32ABCDE1234F1Z5" />
        <TextField label="Timezone" required value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} error={errors.timezone} disabled={!admin} />
      </div>
      <hr className="divider" />
      <div className="stack-sm"><h3 className="h3">Approval policy</h3>
        <Check label="Require a distinct approver for price changes and campaign budgets" checked={state.policy.distinctApprover} disabled={!admin} onChange={(v) => { const r = run((s, a) => setPolicy(s, a, { distinctApprover: v })); if (r.ok) toast(v ? "Self-approval is prohibited." : "Self-approval is now allowed. This is audited.", "ok"); }} help="Default policy. Turning it off lets a requester approve their own request; the change is audited." />
      </div>
    </section>
  );
}

/* Branches ----------------------------------------------------------------------- */

function Branches() {
  const { state, can, run } = useWorkspace();
  const toast = useToast();
  const [edit, setEdit] = useState<null | { id?: string; name: string; city: string; state: string; timezone: string }>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const admin = can("settings.admin");
  return (
    <section className="card stack" aria-labelledby="br-h">
      <div className="spread"><h2 className="h2" id="br-h">Branches</h2>{admin ? <Button variant="primary" onClick={() => { setEdit({ name: "", city: "", state: "", timezone: "Asia/Kolkata" }); setErrors({}); }}>Add branch</Button> : null}</div>
      {!admin ? <Notice tone="warn" role="status">Branch settings are read-only for your role.</Notice> : null}
      <div className="table-wrap fit"><table className="data-table"><thead><tr><th>Branch</th><th>City</th><th>State</th><th>Timezone</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{state.branches.map((b) => <tr key={b.id}><td><span className="row-title">{b.name}</span>{b.isDefault ? <span className="sub">Default branch</span> : null}</td><td>{b.city}</td><td>{b.state}</td><td>{b.timezone}</td><td>{admin ? <Button size="sm" variant="ghost" onClick={() => { setEdit({ ...b }); setErrors({}); }}>Edit</Button> : null}</td></tr>)}</tbody></table></div>
      {edit ? (
        <Dialog open onClose={() => setEdit(null)} dirty title={edit.id ? "Edit branch" : "Add branch"} footer={<><Button onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" onClick={() => { const r = run((s, a) => saveBranch(s, a, edit)); if (!r.ok) { setErrors(r.fields ?? { form: r.message }); return; } toast("Branch saved."); setEdit(null); }}>Save</Button></>}>
          <FormSummary errors={errors} />
          <TextField label="Branch display name" required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} error={errors.name} data-autofocus />
          <div className="form-grid"><TextField label="City" required value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} error={errors.city} /><TextField label="State" required value={edit.state} onChange={(e) => setEdit({ ...edit, state: e.target.value })} error={errors.state} /></div>
          <TextField label="Timezone" required value={edit.timezone} onChange={(e) => setEdit({ ...edit, timezone: e.target.value })} error={errors.timezone} />
        </Dialog>
      ) : null}
    </section>
  );
}

/* Team --------------------------------------------------------------------------- */

function Team() {
  const { state, can, run } = useWorkspace();
  const toast = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleFor, setRoleFor] = useState<{ id: string; name: string; role: Role } | null>(null);
  const [removeFor, setRemoveFor] = useState<string | null>(null);
  const admin = can("settings.team");
  return (
    <section className="card stack" aria-labelledby="tm-h">
      <div className="spread"><h2 className="h2" id="tm-h">Team &amp; roles</h2>{admin ? <Button variant="primary" onClick={() => setInviteOpen(true)}>Invite member</Button> : null}</div>
      {!admin ? <Notice tone="warn" role="status">Team changes need Owner access. You can see roles and branches.</Notice> : null}
      <div className="table-wrap fit"><table className="data-table"><thead><tr><th>Person</th><th>Role</th><th>Branches</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{state.team.map((m) => <tr key={m.id}><td><span className="row-title">{m.name}</span><span className="sub">{m.email}</span></td><td>{ROLE_LABEL[m.role]}</td><td>{m.branchIds.map((b) => state.branches.find((x) => x.id === b)?.city ?? b).join(", ")}</td><td>{m.status}</td>
          <td>{admin ? <div className="row-flex">{m.status === "Active" ? <Button size="sm" variant="ghost" onClick={async () => { const r = await fetch("/api/team/reset-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: m.email }) }); const body = await r.json().catch(() => ({})); if (!r.ok) { toast(body?.error?.message ?? "Could not issue a reset link.", "error"); return; } window.dispatchEvent(new CustomEvent("vl:effects", { detail: { inviteLinks: [{ email: m.email, token: body.token, expiresAt: body.expires_at, kind: "reset" }] } })); }}>Reset link</Button> : null}<Button size="sm" variant="ghost" onClick={() => setRoleFor({ id: m.id, name: m.name, role: m.role })}>Change role</Button><Button size="sm" variant="ghost" onClick={() => setRemoveFor(m.id)}>Remove</Button></div> : null}</td></tr>)}</tbody></table></div>
      <dl className="kv">{ROLES.map((r) => <div key={r}><dt>{ROLE_LABEL[r]}</dt><dd style={{ maxWidth: 420, fontWeight: 400 }}>{ROLE_SUMMARY[r]}</dd></div>)}</dl>
      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <RoleDialog target={roleFor} onClose={() => setRoleFor(null)} />
      <Dialog open={Boolean(removeFor)} onClose={() => setRemoveFor(null)} title="Remove team member" description="Access is revoked immediately. The last owner cannot be removed." footer={<><Button onClick={() => setRemoveFor(null)}>Keep</Button><Button variant="danger" onClick={() => { const r = run((s, a) => removeMember(s, a, removeFor!)); if (r.ok) toast("Member removed."); else toast(r.message, "error"); setRemoveFor(null); }}>Remove member</Button></>}><p className="muted">{state.team.find((m) => m.id === removeFor)?.name} loses access to all branches.</p></Dialog>
    </section>
  );
}

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, run, session } = useWorkspace();
  const toast = useToast();
  const [form, setForm] = useState<{ email: string; role: Role | ""; branchIds: string[] }>({ email: "", role: "", branchIds: [] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (open) { setForm({ email: "", role: "", branchIds: [] }); setErrors({}); } }, [open]);
  const permitted = state.branches.filter((b) => session.branchIds.includes(b.id));
  return (
    <Dialog open={open} onClose={onClose} dirty={Boolean(form.email)} title="Invite team member" description="Invitations are scoped to a role and branches. Invites cannot elevate roles or change tenant." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { const r = run((s, a) => inviteMember(s, a, { email: form.email, role: (form.role || "viewer") as Role, branchIds: form.branchIds })); if (!r.ok) { setErrors(r.fields ?? { form: r.message }); return; } toast(`Invitation created for ${r.member.email}. Copy the one-time link to share it.`); onClose(); }}>Send invitation</Button></>}>
      <FormSummary errors={errors} />
      <TextField label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} data-autofocus />
      <SelectField label="Role" required value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} placeholder="Choose a role" error={errors.role} help={form.role ? ROLE_SUMMARY[form.role as Role] : undefined} />
      <fieldset className="radio-group"><legend className="label">Branches</legend>{permitted.map((b) => <Check key={b.id} label={b.name} checked={form.branchIds.includes(b.id)} onChange={(v) => setForm({ ...form, branchIds: v ? [...form.branchIds, b.id] : form.branchIds.filter((x) => x !== b.id) })} />)}{errors.branchIds ? <div className="field-error" role="alert">{errors.branchIds}</div> : null}</fieldset>
      {form.role ? <div className="card tight"><strong>Permission preview</strong><ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>{(["inventory.edit", "price.approve", "campaign.edit", "leads.edit", "capital.view", "settings.team"] as const).map((c) => <li key={c}>{c.replace(".", ": ")}: {canDo(form.role as Role, c) ? "allowed" : "not allowed"}</li>)}</ul></div> : null}
    </Dialog>
  );
}

function RoleDialog({ target, onClose }: { target: { id: string; name: string; role: Role } | null; onClose: () => void }) {
  const { run } = useWorkspace();
  const toast = useToast();
  const [role, setRole] = useState<Role>("viewer");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (target) { setRole(target.role); setPassword(""); setError(""); } }, [target]);
  if (!target) return null;
  return (
    <Dialog open onClose={onClose} title={`Change role for ${target.name}`} description="Privilege escalation needs re-authentication. The change is audited." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} loadingLabel="Saving" onClick={async () => {
      setBusy(true); setError("");
      const reauthenticated = password ? (await reauth(password)) === null : false;
      const r = run((s, a) => changeRole(s, a, target.id, role, reauthenticated));
      setBusy(false);
      if (!r.ok) { setError(r.fields?.password ? (password ? "That password is not correct." : r.fields.password) : r.message); return; }
      toast(`${target.name} is now ${ROLE_LABEL[role]}.`); onClose();
    }}>Save role</Button></>}>
      <SelectField label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)} options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
      <PasswordField label="Confirm your password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" error={error} help="Needed when granting a higher role." />
    </Dialog>
  );
}

/* Security ----------------------------------------------------------------------- */

function Security() {
  const { state, session, run, can } = useWorkspace();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  return (
    <section className="card stack" aria-labelledby="sec-h">
      <h2 className="h2" id="sec-h">Security</h2>
      <dl className="kv">
        <div><dt>Signed in as</dt><dd>{session.name} / {session.email}</dd></div><div><dt>Role</dt><dd>{ROLE_LABEL[session.role]}</dd></div>
        <div><dt>Branches</dt><dd>{session.branchIds.map((b) => state.branches.find((x) => x.id === b)?.city ?? b).join(", ")}</dd></div>
        <div><dt>Session</dt><dd>Secure HttpOnly cookie, 8 hours. No tokens in local storage.</dd></div>
      </dl>
      <TwoFactor />
      <div className="stack-sm"><h3 className="h3">Sessions</h3><p className="muted">{state.sessionsRevoked ? `Other sessions revoked ${state.sessionsRevoked} time(s).` : "Revoke all other sessions if a device is lost."}</p>
        {confirm ? <Notice tone="danger" role="alert"><div className="spread" style={{ flexWrap: "wrap" }}><span>Revoke every other session?</span><span className="row-flex"><Button size="sm" variant="danger" onClick={() => { run((s, a) => revokeSessions(s, a)); setConfirm(false); toast("Other sessions revoked."); }}>Revoke other sessions</Button><Button size="sm" onClick={() => setConfirm(false)}>Keep</Button></span></div></Notice> : <div><Button onClick={() => setConfirm(true)}>Revoke other sessions</Button></div>}
      </div>
      {can("settings.admin") ? <p className="meta">Identity provider settings and MFA enforcement are managed by your workspace owner.</p> : null}
    </section>
  );
}

async function twoFactor(body: Record<string, string>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const r = await fetch("/api/auth/two-factor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  } catch { return { ok: false, data: { error: { message: "We could not reach the server. Try again." } } }; }
}

function TwoFactor() {
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

/* Billing ------------------------------------------------------------------------ */

function Billing() {
  return (
    <section className="card stack" aria-labelledby="bill-h">
      <h2 className="h2" id="bill-h">Billing</h2>
      <Notice tone="accent" role="status">Billing is handled directly by VandLabs for this workspace. No plan, usage or invoice data is connected here, so nothing is shown rather than estimating it.</Notice>
    </section>
  );
}

/* API access --------------------------------------------------------------------- */

type ApiKeyRow = { id: string; name: string; scope: string; prefix: string; createdBy: string; createdAt: string; expiresAt: string; revokedAt: string | null; lastUsedAt: string | null };
const SCOPE_LABEL: Record<string, string> = { "inventory:read": "Read stock (no costs or margins)", "leads:read": "Read leads, including contact details" };

function ApiAccess() {
  const { can } = useWorkspace();
  const toast = useToast();
  const allowed = can("settings.keys");
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [creating, setCreating] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyRow | null>(null);
  const load = () => fetch("/api/settings/api-keys").then(async (r) => { const b = await r.json().catch(() => ({})); if (r.ok) setKeys(b.keys); else setLoadError(b?.error?.message ?? "Keys could not be loaded."); }).catch(() => setLoadError("We could not reach the server."));
  useEffect(() => { if (allowed) void load(); }, [allowed]);
  if (!allowed) return <section className="card"><h2 className="h2">API access</h2><Notice tone="warn" role="status">API keys are managed by the workspace owner.</Notice></section>;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <section className="card stack" aria-labelledby="api-h">
      <div className="spread" style={{ flexWrap: "wrap" }}><h2 className="h2" id="api-h">API access</h2><Button variant="primary" onClick={() => setCreating(true)}>Create key</Button></div>
      <p className="muted">Read-only keys let another system (your website, a CRM, a spreadsheet) read this workspace. Keys cover the branches you can see, expire automatically and can be revoked at any time. Only a hash is stored, so a key is shown once.</p>
      {shown ? <Notice tone="accent" role="alert"><div className="stack-sm"><strong>Copy this key now. It will not be shown again.</strong><code style={{ wordBreak: "break-all" }}>{shown}</code><span className="row-flex"><Button size="sm" onClick={() => { void navigator.clipboard?.writeText(shown); toast("Key copied."); }}>Copy</Button><Button size="sm" onClick={() => setShown(null)}>I have stored it</Button></span></div></Notice> : null}
      {loadError ? <Notice tone="danger" role="alert">{loadError}</Notice> : null}
      {keys === null && !loadError ? <p className="muted">Loading keys.</p> : null}
      {keys && !keys.length ? <EmptyState title="No API keys yet">Create a key when another system needs to read stock or leads.</EmptyState> : null}
      {keys && keys.length ? (
        <div className="table-wrap"><table className="data-table dense"><thead><tr><th>Name</th><th>Access</th><th>Key</th><th>Created</th><th>Expires</th><th>Last used</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
          {keys.map((k) => { const expired = new Date(k.expiresAt) < new Date(); return (
            <tr key={k.id}><td>{k.name}</td><td>{SCOPE_LABEL[k.scope] ?? k.scope}</td><td><code>{k.prefix}…</code></td><td>{formatShortDateTime(k.createdAt)} by {k.createdBy}</td><td>{formatShortDateTime(k.expiresAt)}</td><td>{k.lastUsedAt ? formatShortDateTime(k.lastUsedAt) : "Never"}</td>
              <td>{k.revokedAt ? <Badge tone="neutral">Revoked</Badge> : expired ? <Badge tone="warn">Expired</Badge> : <Badge tone="accent">Active</Badge>}</td>
              <td>{!k.revokedAt && !expired ? <Button size="sm" variant="danger" onClick={() => setRevoking(k)}>Revoke</Button> : null}</td></tr>); })}
        </tbody></table></div>
      ) : null}
      <div className="stack-sm"><h3 className="h3">Using a key</h3><p className="muted">Send the key in the Authorization header. Responses are JSON; each key is limited to 60 requests a minute.</p>
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 13 }}>{`curl -H "Authorization: Bearer <key>" ${origin}/api/v1/inventory\ncurl -H "Authorization: Bearer <key>" ${origin}/api/v1/leads`}</pre></div>
      {creating ? <CreateKeyDialog onClose={() => setCreating(false)} onCreated={(key) => { setCreating(false); setShown(key); void load(); }} /> : null}
      {revoking ? <Dialog open onClose={() => setRevoking(null)} title={`Revoke ${revoking.name}?`} description="Systems using this key stop working immediately. This cannot be undone; create a new key if needed." footer={<><Button onClick={() => setRevoking(null)}>Keep key</Button><Button variant="danger" onClick={async () => {
        const r = await fetch(`/api/settings/api-keys?id=${encodeURIComponent(revoking.id)}`, { method: "DELETE" }).catch(() => null);
        setRevoking(null);
        if (r?.ok) { toast("Key revoked."); void load(); } else toast("The key could not be revoked. Try again.", "error");
      }}>Revoke key</Button></>}><p>{revoking.prefix}…</p></Dialog> : null}
    </section>
  );
}

function CreateKeyDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (key: string) => void }) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState("inventory:read");
  const [days, setDays] = useState("90");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onClose={onClose} title="Create API key" description="Read-only. Creating a key needs your password." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} loadingLabel="Creating" onClick={async () => {
      setBusy(true); setErrors({});
      const failed = await reauth(password);
      if (failed) { setBusy(false); setErrors({ password: failed }); return; }
      const r = await fetch("/api/settings/api-keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, scope, days: Number(days) }) }).catch(() => null);
      const b = await r?.json().catch(() => ({}));
      setBusy(false);
      if (r?.ok) { onCreated(String(b.key)); return; }
      setErrors(b?.error?.fields ?? { name: b?.error?.message ?? "The key could not be created." });
    }}>Create key</Button></>}>
      <div className="stack">
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} help="For example: Website stock feed" />
        <SelectField label="Access" value={scope} onChange={(e) => setScope(e.target.value)} error={errors.scope} options={Object.entries(SCOPE_LABEL).map(([value, label]) => ({ value, label }))} />
        <SelectField label="Expires after" value={days} onChange={(e) => setDays(e.target.value)} error={errors.days} options={[{ value: "30", label: "30 days" }, { value: "90", label: "90 days" }, { value: "180", label: "180 days" }, { value: "365", label: "1 year" }]} />
        <PasswordField label="Confirm your password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" error={errors.password} />
      </div>
    </Dialog>
  );
}

/* Notifications ------------------------------------------------------------------ */

const NOTIFY: [string, string, string][] = [["alerts.critical", "Critical alerts", "Integration failures and stale sources."], ["alerts.approvals", "Approvals waiting", "Price and budget requests assigned to you."], ["leads.assigned", "Lead assignments", "New leads and overdue first responses."], ["reports.ready", "Scheduled reports", "Report links when a schedule delivers."], ["security.notices", "Security notices", "Sign-ins and role changes. These cannot be disabled."]];

function Notifications() {
  const { state, run } = useWorkspace();
  const toast = useToast();
  const [draft, setDraft] = useState(state.notifications);
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.notifications);
  return (
    <section className="card stack" aria-labelledby="nt-h">
      <div className="spread"><h2 className="h2" id="nt-h">Notifications</h2>{dirty ? <Button variant="primary" onClick={() => { let failed = ""; for (const [k, v] of Object.entries(draft)) { const r = run((s, a) => setNotification(s, a, k, v)); if (!r.ok) failed = r.message; } if (failed) toast(failed, "error"); else toast("Notification preferences saved."); }}>Save</Button> : null}</div>
      <p className="muted">Toggles stay in draft until you press Save. Critical security notices cannot be disabled. Email and message delivery channels are not connected yet, so these preferences apply when notifications are enabled.</p>
      <div className="stack-sm">{NOTIFY.map(([key, label, help]) => <Check key={key} label={label} help={help} checked={draft[key] ?? false} disabled={key === "security.notices"} onChange={(v) => setDraft({ ...draft, [key]: v })} />)}</div>
    </section>
  );
}

/* Audit -------------------------------------------------------------------------- */

function Audit() {
  const { state, can } = useWorkspace();
  const toast = useToast();
  const [filter, setFilter] = useState("");
  const allowed = can("settings.audit");
  const rows = useMemo(() => state.audit.filter((a) => `${a.actor} ${a.action} ${a.target} ${a.detail}`.toLowerCase().includes(filter.toLowerCase())), [state.audit, filter]);
  if (!allowed) return <section className="card"><h2 className="h2">Audit</h2><Notice tone="warn" role="status">The audit trail is permission-gated. Requires Owner access.</Notice></section>;
  return (
    <section className="card stack" aria-labelledby="au-h">
      <div className="spread"><h2 className="h2" id="au-h">Audit</h2><Button onClick={() => { downloadCsv("audit.csv", [["time (UTC, ISO 8601)", "time (IST)", "actor", "action", "target", "detail"], ...rows.map((a) => [a.at, formatDateTime(a.at), a.actor, a.action, a.target, a.detail])], ["# Secrets and contact values are masked in exports. Retention follows policy."]); toast("Audit export ready: secrets masked."); }}>Export</Button></div>
      <p className="muted">Append-only and filterable. Exports mask secrets and respect retention.</p>
      <TextField label="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Actor, action or record" />
      <div className="table-wrap fit"><table className="data-table dense"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead><tbody>{rows.slice(0, 100).map((a) => <tr key={a.id}><td style={{ whiteSpace: "nowrap" }}>{formatDateTime(a.at)}</td><td>{a.actor}</td><td>{a.action}</td><td>{a.target}</td><td className="muted" style={{ maxWidth: 320 }}>{a.detail}</td></tr>)}</tbody></table></div>
      {rows.length === 0 ? <p className="muted">No audit events match.</p> : null}
    </section>
  );
}
