"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { inviteMember, saveBranch, saveBusiness } from "@/lib/actions";
import type { Role } from "@/lib/domain";
import { emptyDraft, STEPS, validateStep, type OnboardingDraft } from "@/lib/onboarding";
import { ROLE_LABEL, ROLES } from "@/lib/permissions";
import { Brand } from "../brand";
import { Menu } from "../overlay";
import { useToast } from "../toast";
import { Button, Check, FormSummary, Notice, SelectField, TextField } from "../ui";
import { useWorkspace } from "../workspace";

const KEY = "vl.onboarding.draft.v1";

/** Non-sensitive draft only: no passwords are ever stored. */
function loadDraft(base: OnboardingDraft): OnboardingDraft {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { ...base, ...(JSON.parse(raw) as OnboardingDraft) };
  } catch { /* storage unavailable */ }
  return base;
}

export function Onboarding() {
  const router = useRouter();
  const toast = useToast();
  const { state, run, can, session } = useWorkspace();
  const first = state.branches[0];
  const base = useMemo(() => emptyDraft({ legalName: state.tenant.legalName, displayName: state.tenant.displayName, gstin: state.tenant.gstin, timezone: state.tenant.timezone, branch: first }), [state.tenant, first]);
  const [draft, setDraft] = useState<OnboardingDraft>(base);
  const [loaded, setLoaded] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { setDraft(loadDraft(base)); setLoaded(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!loaded) return; try { window.localStorage.setItem(KEY, JSON.stringify(draft)); } catch { /* ignore */ } }, [draft, loaded]);
  useEffect(() => { headingRef.current?.focus(); }, [draft.step]);

  const step = Math.min(5, Math.max(1, draft.step));
  const meta = STEPS[step - 1];
  const set = (patch: Partial<OnboardingDraft>) => { setDraft((d) => ({ ...d, ...patch })); setErrors({}); };
  const go = (n: number) => { setErrors({}); setDraft((d) => ({ ...d, step: n })); };

  async function next() {
    setBusy(true);
    try {
      const response = await fetch("/api/onboarding/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step, draft }) });
      if (response.status === 401) { router.push("/login?reason=expired&returnTo=/onboarding"); return; }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setErrors(body?.error?.fields ?? validateStep(step, draft)); return; }
      go(Math.min(5, step + 1));
    } catch {
      const local = validateStep(step, draft);
      if (Object.keys(local).length) setErrors(local); else go(Math.min(5, step + 1));
    } finally { setBusy(false); }
  }

  const saveAndExit = () => { toast("Progress saved. Resume from Settings or sign in again."); router.push("/app/overview"); };

  function activate() {
    for (let s = 1; s <= 4; s += 1) { const e = validateStep(s, draft); if (Object.keys(e).length) { go(s); setErrors(e); return; } }
    if (!can("settings.admin")) { setErrors({ role: "Only a workspace administrator can activate the workspace." }); return; }
    const b = run((s, a) => saveBusiness(s, a, { displayName: draft.business.displayName, legalName: draft.business.legalName, gstin: draft.business.gstin, timezone: draft.business.timezone }));
    if (!b.ok) { setErrors(b.fields ?? { form: b.message }); go(1); return; }
    const br = run((s, a) => saveBranch(s, a, { id: first?.id, name: draft.branch.name, city: draft.branch.city, state: draft.branch.state, timezone: draft.branch.timezone }));
    if (!br.ok) { setErrors(br.fields ?? { form: br.message }); go(2); return; }
    let sent = 0;
    for (const invite of draft.invites) { const r = run((s, a) => inviteMember(s, a, { email: invite.email, role: invite.role as Role, branchIds: first ? [first.id] : [] })); if (r.ok) sent += 1; }
    try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
    toast(`Workspace activated.${sent ? ` ${sent} invitation link(s) created: copy and share them.` : ""}`);
    router.push("/app/overview");
  }

  return (
    <div className="onb">
      <header className="onb-header">
        <Brand sub={false} href="/app/overview" />
        <span className="meta onb-draft">Setup draft / {draft.business.displayName || "Your dealership"}</span>
        <div className="only-mobile"><Menu label="Setup menu" buttonClass="btn btn-ghost" text="Menu">{(close) => <button role="menuitem" onClick={() => { close(); saveAndExit(); }}>Save and exit</button>}</Menu></div>
      </header>
      <div className="onb-body">
        <nav className="onb-steps only-desktop" aria-label="Workspace setup">
          <p className="eyebrow" style={{ marginBottom: 16 }}>Workspace setup</p>
          <ol>{STEPS.map((s, i) => (
            <li key={s.key} aria-current={i + 1 === step ? "step" : undefined} className={i + 1 === step ? "current" : i + 1 < step ? "done" : ""}>
              <button type="button" onClick={() => { if (i + 1 < step) go(i + 1); }} disabled={i + 1 > step}>
                <strong>{i + 1} {s.label}</strong><span>{i + 1 < step ? "Completed" : i + 1 === step ? "Current step" : s.hint}</span>
              </button>
            </li>
          ))}</ol>
        </nav>
        <main className="onb-main" id="content" tabIndex={-1}>
          <p className="eyebrow only-mobile" aria-live="polite">Step {step} of 5 / {meta.label}</p>
          <h1 className="h1" ref={headingRef} tabIndex={-1} id="page-title">{meta.title}</h1>
          <section className="card onb-card" aria-labelledby="onb-card-title">
            <h2 className="h3" id="onb-card-title">{meta.label} details / Step {step} of 5</h2>
            <FormSummary errors={errors} />
            {step === 1 ? (
              <div className="form-grid mt-4">
                <TextField label="Legal business name" required value={draft.business.legalName} onChange={(e) => set({ business: { ...draft.business, legalName: e.target.value } })} error={errors.legalName} autoComplete="organization" />
                <TextField label="Display name" required value={draft.business.displayName} onChange={(e) => set({ business: { ...draft.business, displayName: e.target.value } })} error={errors.displayName} />
                <TextField label="City" required value={draft.business.city} onChange={(e) => set({ business: { ...draft.business, city: e.target.value } })} error={errors.city} />
                <TextField label="State" required value={draft.business.state} onChange={(e) => set({ business: { ...draft.business, state: e.target.value } })} error={errors.state} />
                <TextField label="Branch timezone" required value={draft.business.timezone} onChange={(e) => set({ business: { ...draft.business, timezone: e.target.value } })} error={errors.timezone} />
                <TextField label="GSTIN / optional" value={draft.business.gstin} onChange={(e) => set({ business: { ...draft.business, gstin: e.target.value } })} error={errors.gstin} placeholder="32ABCDE1234F1Z5" />
              </div>
            ) : null}
            {step === 2 ? (
              <div className="stack mt-4">
                <p className="muted">This branch scopes stock, staff access and operational reporting.</p>
                <div className="form-grid">
                  <TextField label="Branch display name" required value={draft.branch.name} onChange={(e) => set({ branch: { ...draft.branch, name: e.target.value } })} error={errors.branchName} />
                  <TextField label="City" required value={draft.branch.city} onChange={(e) => set({ branch: { ...draft.branch, city: e.target.value } })} error={errors.branchCity} />
                  <TextField label="State" required value={draft.branch.state} onChange={(e) => set({ branch: { ...draft.branch, state: e.target.value } })} error={errors.branchState} />
                  <TextField label="Timezone" required value={draft.branch.timezone} onChange={(e) => set({ branch: { ...draft.branch, timezone: e.target.value } })} error={errors.branchTimezone} />
                  <TextField label="Branch address / optional" className="span-2" value={draft.branch.address} onChange={(e) => set({ branch: { ...draft.branch, address: e.target.value } })} placeholder="Address (optional)" />
                </div>
                <Check label="Set as default branch for this workspace" checked={draft.branch.isDefault} onChange={(v) => set({ branch: { ...draft.branch, isDefault: v } })} />
                <p className="muted">Staff will receive access only to the branches assigned by an administrator. You can add other branches later in Settings.</p>
              </div>
            ) : null}
            {step === 3 ? (
              <div className="stack mt-4">
                <p className="muted">Invites are sent only after you confirm on the Review step. Invites cannot elevate roles or change tenant.</p>
                {draft.invites.map((invite, i) => (
                  <div className="form-grid" key={i} style={{ alignItems: "end" }}>
                    <TextField label={`Invite ${i + 1} email`} type="email" value={invite.email} onChange={(e) => set({ invites: draft.invites.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)) })} error={errors[`invite${i}`]} />
                    <div className="row-flex" style={{ alignItems: "end" }}><SelectField label="Role" value={invite.role} onChange={(e) => set({ invites: draft.invites.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)) })} options={ROLES.filter((r) => r !== "owner").map((r) => ({ value: r, label: ROLE_LABEL[r] }))} placeholder="Choose role" /><Button variant="ghost" onClick={() => set({ invites: draft.invites.filter((_, j) => j !== i) })} aria-label={`Remove invite ${i + 1}`}>Remove</Button></div>
                  </div>
                ))}
                <div><Button onClick={() => set({ invites: [...draft.invites, { email: "", role: "", branchId: first?.id ?? "" }] })}>Add team member</Button></div>
                {draft.invites.length === 0 ? <p className="meta">Team is optional now: add people later in Settings.</p> : null}
              </div>
            ) : null}
            {step === 4 ? (
              <fieldset className="radio-group mt-4"><legend className="label">How would you like to start?</legend>
                {([["import", "Import stock from CSV after activation", "Opens the validated import with preview."], ["later", "Connect a licensed source later", "Market estimates stay unavailable until a source is connected."], ["skip", "Skip this optional step", "Opens an empty Command Centre. Required business fields cannot be skipped."]] as const).map(([v, l, h]) => (
                  <label key={v} className="check"><input type="radio" name="data" checked={draft.data === v} onChange={() => set({ data: v })} /><span>{l}<span className="help" style={{ display: "block" }}>{h}</span></span></label>
                ))}
              </fieldset>
            ) : null}
            {step === 5 ? (
              <div className="stack mt-4">
                <dl className="kv">
                  <div><dt>Business</dt><dd>{draft.business.displayName} / {draft.business.legalName}</dd></div>
                  <div><dt>Location</dt><dd>{draft.business.city}, {draft.business.state} / {draft.business.timezone}</dd></div>
                  <div><dt>First branch</dt><dd>{draft.branch.name} / {draft.branch.city}, {draft.branch.state}{draft.branch.isDefault ? " / default" : ""}</dd></div>
                  <div><dt>Team invitations</dt><dd>{draft.invites.length ? draft.invites.map((i) => `${i.email} (${ROLE_LABEL[i.role as Role] ?? i.role})`).join(", ") : "None now"}</dd></div>
                  <div><dt>Source permissions</dt><dd>{draft.data === "import" ? "CSV import after activation" : draft.data === "later" ? "Connect a licensed source later" : "Skipped: empty Command Centre"}</dd></div>
                </dl>
                <Notice role="status">Activation happens only here. Confirming creates the workspace configuration for {session.name}; no account is created by this document.</Notice>
              </div>
            ) : null}
            <div className="onb-actions">
              <Button onClick={() => go(Math.max(1, step - 1))} disabled={step === 1}>Back</Button>
              <Button className="only-desktop" onClick={saveAndExit}>Save and exit</Button>
              {step < 5 ? <Button variant="primary" onClick={next} loading={busy} loadingLabel="Checking" className="onb-continue">Continue</Button> : <Button variant="primary" className="onb-continue" onClick={activate} disabled={!can("settings.admin")} reason={!can("settings.admin") ? "Only a workspace administrator can activate." : undefined}>Confirm and activate</Button>}
            </div>
          </section>
          <p className="footnote">Required fields are marked *. Continue validates this step; activation occurs only after Review.</p>
          <p className="meta">Changes here are saved to your workspace when you activate.</p>
          <button type="button" className="link-btn only-mobile" onClick={saveAndExit}>Save and exit</button>
        </main>
      </div>
    </div>
  );
}
