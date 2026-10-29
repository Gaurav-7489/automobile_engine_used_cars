"use client";

import Link from "next/link";
import { useState } from "react";
import { LEAD_STAGES, type LeadStage } from "@/lib/domain";
import { OUTCOME_LABEL, TRIGGER_LABEL, type AutomationRule, type AutomationRun, type AutomationTrigger, type RunOutcome } from "@/lib/automation";
import { formatShortDateTime } from "@/lib/format";
import { call } from "../admin/shared";
import { Dialog } from "../overlay";
import { RemotePanel } from "../panel";
import { useToast } from "../toast";
import { Badge, Button, Check, EmptyState, FormSummary, Notice, PageHead, SelectField, TextField } from "../ui";
import { useRemote } from "../use-remote";
import { useScopedHref, useUrlState, useWorkspace } from "../workspace";

type Data = { rules: AutomationRule[]; runs: AutomationRun[]; total: number; counts: Record<string, number> };
type Draft = { id: string | null; name: string; enabled: boolean; trigger: AutomationTrigger; stages: LeadStage[]; delayMinutes: string; taskTitle: string; priority: "normal" | "high"; channel: "internal_task" | "whatsapp"; requiresConsent: boolean };

const blank = (): Draft => ({ id: null, name: "", enabled: true, trigger: "lead_created", stages: [], delayMinutes: "60", taskTitle: "", priority: "normal", channel: "internal_task", requiresConsent: true });
const toDraft = (r: AutomationRule): Draft => ({ id: r.id, name: r.name, enabled: r.enabled, trigger: r.trigger, stages: r.stages, delayMinutes: String(r.delayMinutes), taskTitle: r.taskTitle, priority: r.priority, channel: r.channel, requiresConsent: r.requiresConsent });

export function AutomationsPage() {
  const { can, scope } = useWorkspace();
  const manage = can("automations.manage");
  const url = useUrlState();
  const href = useScopedHref();
  const toast = useToast();
  const page = Math.max(1, Number(url.get("page")) || 1), outcome = url.get("outcome");
  const remote = useRemote<Data>(`/api/automations?page=${page}${outcome ? `&outcome=${outcome}` : ""}`);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busyId, setBusyId] = useState("");
  void scope;

  const toggle = async (r: AutomationRule) => {
    setBusyId(r.id);
    const res = await call<object>(`/api/automations/rules/${r.id}`, { method: "PUT", body: JSON.stringify({ ...r, enabled: !r.enabled }) });
    setBusyId("");
    if (res.ok) { toast(`${r.name} ${r.enabled ? "turned off" : "turned on"}.`); remote.reload(); } else toast(res.data.error?.message ?? "The rule was not changed.", "error");
  };
  const remove = async (r: AutomationRule) => {
    if (!window.confirm(`Delete the rule “${r.name}”? Tasks it already created stay on their leads.`)) return;
    setBusyId(r.id);
    const res = await call<object>(`/api/automations/rules/${r.id}`, { method: "DELETE" });
    setBusyId("");
    if (res.ok) { toast("Rule deleted."); remote.reload(); } else toast(res.data.error?.message ?? "The rule was not deleted.", "error");
  };

  return (
    <div className="page">
      <PageHead title="Automations" lead="Follow-up rules that turn new leads and stage moves into tasks. Every evaluation is recorded; nothing is sent to customers." actions={manage ? <Button variant="primary" onClick={() => setEditing(blank())}>New rule</Button> : undefined} />
      <RemotePanel title="Automations" remote={remote} rows={5}>
        {remote.data ? (
          <>
            <section className="card stack" aria-labelledby="ar-h">
              <h2 className="h2" id="ar-h">Rules</h2>
              {!remote.data.rules.length ? <EmptyState title="No rules yet" actions={manage ? <Button variant="primary" onClick={() => setEditing(blank())}>Create the first rule</Button> : undefined}>Rules create a follow-up task when a lead is added or reaches a stage.</EmptyState> : (
                <ul className="list-plain">{remote.data.rules.map((r) => (
                  <li key={r.id} className="row-flex between">
                    <div>
                      <strong>{r.name}</strong> <Badge tone={r.enabled ? "accent" : "neutral"}>{r.enabled ? "On" : "Off"}</Badge>
                      <div className="meta">{TRIGGER_LABEL[r.trigger]}{r.stages.length ? `: ${r.stages.join(", ")}` : ""} / {r.channel === "whatsapp" ? "WhatsApp (held until a provider is connected)" : `Task “${r.taskTitle}” due after ${r.delayMinutes} min`}{r.priority === "high" ? " / high priority" : ""}</div>
                    </div>
                    {manage ? <div className="row-flex">
                      <Button size="sm" loading={busyId === r.id} loadingLabel="Saving…" onClick={() => toggle(r)}>{r.enabled ? "Turn off" : "Turn on"}</Button>
                      <Button size="sm" disabled={busyId === r.id} onClick={() => setEditing(toDraft(r))}>Edit</Button>
                      <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => remove(r)}>Delete</Button>
                    </div> : null}
                  </li>))}</ul>
              )}
              {!manage ? <Notice>Your role can see automations but not change them.</Notice> : null}
            </section>
            <section className="card stack" aria-labelledby="run-h">
              <h2 className="h2" id="run-h">Recent runs</h2>
              <SelectField label="Outcome" value={outcome} onChange={(e) => url.set({ outcome: e.target.value || null, page: null })} placeholder="All outcomes" options={Object.entries(OUTCOME_LABEL).map(([value, label]) => ({ value, label: `${label} (${remote.data!.counts[value] ?? 0})` }))} />
              {!remote.data.runs.length ? <EmptyState title="No runs recorded">Runs appear when a lead is added or moves to a stage that a rule watches.</EmptyState> : (
                <div className="table-wrap"><table className="data-table dense"><caption className="sr-only">Automation runs, newest first</caption>
                  <thead><tr><th>When</th><th>Rule</th><th>Lead</th><th>Outcome</th><th>Detail</th></tr></thead>
                  <tbody>{remote.data.runs.map((r) => <tr key={r.id}><td style={{ whiteSpace: "nowrap" }}>{formatShortDateTime(r.occurredAt)}</td><td>{r.ruleName}</td><td><Link href={href(`/app/leads?lead=${encodeURIComponent(r.leadId)}`)}>{r.leadId}</Link></td><td><Badge tone={r.outcome === "created" ? "accent" : "neutral"}>{OUTCOME_LABEL[r.outcome as RunOutcome]}</Badge></td><td className="meta">{r.detail}</td></tr>)}</tbody></table></div>
              )}
              {remote.data.total > 25 ? <div className="pager"><span className="meta">Page {page} of {Math.ceil(remote.data.total / 25)} / {remote.data.total} runs</span><div className="row-flex"><Button disabled={page <= 1} onClick={() => url.set({ page: page - 1 })}>Previous</Button><Button disabled={page * 25 >= remote.data.total} onClick={() => url.set({ page: page + 1 })}>Next</Button></div></div> : null}
            </section>
          </>
        ) : null}
      </RemotePanel>
      {editing ? <RuleDialog draft={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast("Rule saved."); remote.reload(); }} /> : null}
    </div>
  );
}

function RuleDialog({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState(draft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }));
  const save = async () => {
    setBusy(true); setErrors({});
    const body = { name: d.name, enabled: d.enabled, trigger: d.trigger, stages: d.stages, delayMinutes: d.delayMinutes.trim() === "" ? NaN : Number(d.delayMinutes), taskTitle: d.taskTitle, priority: d.priority, channel: d.channel, requiresConsent: d.requiresConsent };
    const r = await call<object>(d.id ? `/api/automations/rules/${d.id}` : "/api/automations", { method: d.id ? "PUT" : "POST", body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) onSaved(); else setErrors({ ...(r.data.error?.fields ?? {}), form: r.data.error?.message ?? "The rule was not saved." });
  };
  return (
    <Dialog open onClose={onClose} dirty size="w640" title={d.id ? "Edit rule" : "New rule"} description="The rule runs inside the same save as the lead change, so the task and the lead always agree."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} loadingLabel="Saving rule…" onClick={save}>Save rule</Button></>}>
      <div className="stack">
        <FormSummary errors={errors} />
        <TextField label="Rule name" value={d.name} onChange={(e) => set("name", e.target.value)} error={errors.name} required />
        <SelectField label="Runs when" value={d.trigger} onChange={(e) => set("trigger", e.target.value as AutomationTrigger)} options={Object.entries(TRIGGER_LABEL).map(([value, label]) => ({ value, label }))} error={errors.trigger} />
        {d.trigger === "stage_changed" ? (
          <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}><legend className="h3">Stages</legend>
            {errors.stages ? <div className="field-error" role="alert">{errors.stages}</div> : null}
            {LEAD_STAGES.map((s) => <Check key={s} label={s} checked={d.stages.includes(s)} onChange={(on) => set("stages", on ? [...d.stages, s] : d.stages.filter((x) => x !== s))} />)}
          </fieldset>
        ) : null}
        <SelectField label="Channel" value={d.channel} onChange={(e) => set("channel", e.target.value as Draft["channel"])} options={[{ value: "internal_task", label: "Internal task" }, { value: "whatsapp", label: "WhatsApp (held: no provider connected)" }]} error={errors.channel} />
        {d.channel === "whatsapp" ? <Check label="Only with marketing consent" checked={d.requiresConsent} onChange={(v) => set("requiresConsent", v)} help="Without consent the run is skipped and recorded." /> : null}
        <TextField label="Task title" value={d.taskTitle} onChange={(e) => set("taskTitle", e.target.value)} error={errors.taskTitle} required />
        <div className="form-grid">
          <TextField label="Due after (minutes)" inputMode="numeric" value={d.delayMinutes} onChange={(e) => set("delayMinutes", e.target.value)} error={errors.delayMinutes} />
          <SelectField label="Priority" value={d.priority} onChange={(e) => set("priority", e.target.value as Draft["priority"])} options={[{ value: "normal", label: "Normal" }, { value: "high", label: "High" }]} error={errors.priority} />
        </div>
        <Check label="Rule is on" checked={d.enabled} onChange={(v) => set("enabled", v)} />
      </div>
    </Dialog>
  );
}
