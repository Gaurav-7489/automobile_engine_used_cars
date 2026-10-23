"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { acknowledge, assignAlerts, previewRuleImpact, RESOLUTION_CODES, resolve, snooze, updateRules, type SnoozeChoice } from "@/lib/actions";
import type { Alert } from "@/lib/domain";
import { stockAgeDays } from "@/lib/finance";
import { formatDateTime, formatShortDateTime, formatTime, MISSING } from "@/lib/format";
import { alertCounts, alertsFor, sortAlerts } from "@/lib/selectors";
import { SNAPSHOT_AT } from "@/lib/time";
import { Dialog, Drawer } from "../overlay";
import { Panel } from "../panel";
import { useToast } from "../toast";
import { Button, Check, EmptyState, ErrorPanel, FormSummary, Kpi, Notice, PageHead, SelectField, Tabs, TextArea, TextField } from "../ui";
import { useScopedHref, useUrlState, useWorkspace } from "../workspace";

type TabKey = "open" | "snoozed" | "resolved";

export function AlertsPage() {
  const { state, scope, can, session, run, demoState } = useWorkspace();
  const url = useUrlState();
  const href = useScopedHref();
  const toast = useToast();
  const tab = (["open", "snoozed", "resolved"].includes(url.get("tab")) ? url.get("tab") : "open") as TabKey;
  const type = url.get("type");
  const severity = url.get("severity");
  const assignee = url.get("assignee");
  const due = url.get("due");
  const mine = url.get("scope") === "mine" || url.get("mine") === "1";
  const [selected, setSelected] = useState<string[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [dialog, setDialog] = useState<null | { kind: "snooze" | "assign" | "resolve"; ids: string[] }>(null);
  const openId = url.get("alert");

  const scoped = useMemo(() => alertsFor(state, scope.ids), [state, scope.ids]);
  const counts = alertCounts(scoped);
  const statusFor = (t: TabKey): Alert["status"] => (t === "open" ? "Open" : t === "snoozed" ? "Snoozed" : "Resolved");
  const rows = useMemo(() => sortAlerts(scoped.filter((a) => a.status === statusFor(tab))).filter((a) => {
    if (type && a.type !== type) return false;
    if (severity && a.severity !== severity) return false;
    if (assignee && a.assignee !== assignee) return false;
    if (mine && a.assignee !== session.name) return false;
    if (due === "today" && !(a.dueAt && formatTime(a.dueAt) && new Date(a.dueAt).toDateString() === new Date(SNAPSHOT_AT).toDateString())) return false;
    if (due === "overdue" && !(a.dueAt && new Date(a.dueAt).getTime() < new Date(SNAPSHOT_AT).getTime())) return false;
    if (url.get("waiting") === "1" && !a.waiting) return false;
    return true;
  }), [scoped, tab, type, severity, assignee, mine, due, url, session.name]);
  const active = scoped.find((a) => a.id === openId);
  const filters = [type, severity, assignee, due, mine ? "mine" : "", url.get("waiting")].filter(Boolean).length;
  const people = Array.from(new Set(scoped.map((a) => a.assignee))).sort();
  const action = (a: Alert): { label: string; to: string } => {
    if (a.type === "Pricing") return { label: "Review", to: href("/app/pricing", { vehicle: a.recordRef }) };
    if (a.type === "Leads") return { label: "Open", to: href(`/app/leads/${a.recordRef}`) };
    if (a.type === "Integration") return { label: "Inspect", to: href("/app/settings/integrations") };
    if (a.recordKind === "price-request") return { label: "Review", to: href(`/app/pricing/${a.recordRef}`) };
    if (a.recordKind === "campaign") return { label: "View", to: href(`/app/advertising/${a.recordRef}`) };
    return { label: "View", to: href("/app/alerts", { alert: a.id }) };
  };
  const allOnPage = rows.length > 0 && rows.every((a) => selected.includes(a.id));
  const clear = () => url.set({ type: null, severity: null, assignee: null, due: null, scope: null, mine: null, waiting: null });

  return (
    <div className="page">
      <PageHead title="Alerts and actions" lead="Every alert has a reason, an owner and a next step."
        actions={<>
          <div className="seg" role="group" aria-label="Scope"><Button aria-pressed={mine} onClick={() => url.set({ scope: "mine" })}>My actions</Button><Button aria-pressed={!mine} onClick={() => url.set({ scope: null, mine: null })}>All permitted</Button></div>
          <Button variant="primary" className="primary-cta" onClick={() => setRulesOpen(true)} disabled={!can("alerts.rules")} reason={!can("alerts.rules") ? "Rule settings are for administrators." : undefined}>Rule settings</Button>
        </>} />

      <Panel title="Alert summary" rows={2} partialFail>
        <div className="kpi-grid">
          <Kpi label="Critical" value={counts.critical} note="Integration action" tone="warn" onClick={() => url.set({ tab: null, severity: "Critical" })} />
          <Kpi label="Due today" value={counts.dueToday} note="Assigned work" tone="warn" onClick={() => url.set({ tab: null, due: "today" })} />
          <Kpi label="Overdue" value={counts.overdue} note="Response SLA" tone="warn" onClick={() => url.set({ tab: null, severity: "Overdue" })} />
          <Kpi label="Waiting" value={counts.waiting} note="Approval or acknowledgement" tone="warn" onClick={() => url.set({ tab: null, waiting: "1" })} />
        </div>
      </Panel>

      <Tabs label="Alert status" value={tab} onChange={(v) => url.set({ tab: v === "open" ? null : v })} idPrefix="al" tabs={[{ value: "open", label: "Open" }, { value: "snoozed", label: "Snoozed" }, { value: "resolved", label: "Resolved" }]} />
      <div className="alert-filters" role="group" aria-label="Filters">
        <SelectField label="Type" aria-label="Type" value={type} onChange={(e) => url.set({ type: e.target.value || null })} options={["Integration", "Pricing", "Leads", "Documents", "Approvals"]} placeholder="All types" />
        <SelectField label="Severity" aria-label="Severity" value={severity} onChange={(e) => url.set({ severity: e.target.value || null })} options={["Critical", "Warning", "Due today", "Overdue", "Info"]} placeholder="All severities" />
        <SelectField label="Assignee" aria-label="Assignee" value={assignee} onChange={(e) => url.set({ assignee: e.target.value || null })} options={people} placeholder="All assignees" />
        <SelectField label="Due date" aria-label="Due date" value={due} onChange={(e) => url.set({ due: e.target.value || null })} options={[{ value: "today", label: "Due today" }, { value: "overdue", label: "Overdue" }]} placeholder="Due date" />
        <Button aria-pressed={mine} onClick={() => url.set({ scope: mine ? null : "mine", mine: null })}>My actions</Button>
      </div>
      {filters ? <div className="chip-row"><span className="meta" aria-live="polite">{filters} active filter{filters > 1 ? "s" : ""}</span><button className="link-btn" onClick={clear}>Clear all</button></div> : null}

      {selected.length ? (
        <div className="bulk-bar card tight" role="region" aria-label="Bulk actions"><strong>{selected.length} selected</strong>
          <div className="row-flex"><Button size="sm" onClick={() => { const r = run((s, a) => acknowledge(s, a, selected)); if (r.ok) toast(`${r.count} acknowledged. Acknowledging does not resolve the condition.`); setSelected([]); }} disabled={!can("alerts.act")}>Acknowledge</Button><Button size="sm" onClick={() => setDialog({ kind: "assign", ids: selected })} disabled={!can("alerts.act")}>Assign</Button><Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear selection</Button></div>
          <span className="meta">Bulk assign or acknowledge only: there is no bulk blind resolution.</span></div>
      ) : null}

      {demoState === "error" ? <ErrorPanel title="Monitoring delayed" message={`Rule evaluation failed. Last successful evaluation ${formatDateTime(SNAPSHOT_AT)}. Existing alerts are not auto-cleared.`} onRetry={() => url.set({ demo_state: null })} /> : (
        <Panel title="Alert queue" rows={5} partialFail>
          {rows.length === 0 ? (
            <EmptyState title={tab === "open" && !filters ? "All caught up" : "No alerts match"} actions={filters ? <Button onClick={clear}>Clear filters</Button> : undefined}>
              {tab === "open" && !filters ? `No open alerts. Last rule run ${formatDateTime(SNAPSHOT_AT)}. A scope with no rule run shows Unknown health, never healthy.` : "Nothing matches the current tab and filters."}
            </EmptyState>
          ) : (
            <>
              <div className="table-wrap only-desktop">
                <table className="data-table" aria-label="Alert queue">
                  <thead><tr><th className="sel"><input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={(e) => setSelected(e.target.checked ? rows.map((a) => a.id) : [])} /></th><th style={{ width: 130 }}>Severity</th><th style={{ width: 236 }}>Alert</th><th style={{ width: 160 }}>Record</th><th style={{ width: 280 }}>Trigger</th><th style={{ width: 130 }}>Owner</th><th style={{ width: 104 }}>Due</th><th style={{ width: 120 }}>Action</th></tr></thead>
                  <tbody>{rows.map((a) => {
                    const act = action(a);
                    return (
                      <tr key={a.id} style={{ height: 72 }}>
                        <td className="sel"><input type="checkbox" aria-label={`Select ${a.id}`} checked={selected.includes(a.id)} onChange={() => setSelected((s) => (s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id]))} /></td>
                        <td><strong>{a.severity}</strong></td>
                        <td><button type="button" className="row-title" onClick={() => url.set({ alert: a.id })}>{a.title}</button><span className="sub">{a.id}{a.occurrences > 1 ? ` / seen ${a.occurrences} times` : ""}{a.acknowledgedBy ? ` / acknowledged by ${a.acknowledgedBy}` : ""}</span></td>
                        <td>{a.recordRef}</td><td>{a.trigger}</td><td>{a.assignee}</td><td>{a.status === "Resolved" ? "Resolved" : a.dueLabel === "Today" || a.dueLabel === "Now" || a.dueLabel === "Tomorrow" || a.dueLabel === "Overdue" ? a.dueLabel : a.dueLabel}</td>
                        <td><Link href={act.to} className={a.severity === "Warning" ? "warn-text" : "accent-text"} style={{ fontWeight: 600 }}>{act.label}</Link></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
              <ul className="card-list only-mobile" aria-label="Alerts">{rows.map((a) => { const act = action(a); return (
                <li key={a.id} className="card tight listing-card"><button type="button" className="h3 link-btn" style={{ color: "var(--text)" }} onClick={() => url.set({ alert: a.id })}>{a.title}</button><span className="meta">{a.recordRef} / {a.trigger}</span><span className="meta">{a.severity} / due {a.dueLabel} / {a.assignee}</span><Link className="accent-text" href={act.to}>{act.label} &gt;</Link></li>
              ); })}</ul>
            </>
          )}
        </Panel>
      )}
      <p className="meta">Last rule evaluation {formatTime(SNAPSHOT_AT)} IST / Acknowledge does not resolve / Alerts are calculated from your records and thresholds</p>

      {active ? <AlertDrawer key={active.id} alert={active} onClose={() => url.set({ alert: null })} onDialog={(kind) => setDialog({ kind, ids: [active.id] })} action={action(active)} /> : null}
      <SnoozeDialog open={dialog?.kind === "snooze"} onClose={() => setDialog(null)} ids={dialog?.ids ?? []} />
      <AssignDialog open={dialog?.kind === "assign"} onClose={() => { setDialog(null); setSelected([]); }} ids={dialog?.ids ?? []} />
      <ResolveDialog open={dialog?.kind === "resolve"} onClose={() => setDialog(null)} id={dialog?.ids[0]} />
      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}

function AlertDrawer({ alert, onClose, onDialog, action }: { alert: Alert; onClose: () => void; onDialog: (kind: "snooze" | "assign" | "resolve") => void; action: { label: string; to: string } }) {
  const { can, run } = useWorkspace();
  const toast = useToast();
  const act = can("alerts.act");
  return (
    <Drawer open onClose={onClose} size="w480" title={alert.title} description={`${alert.id} / ${alert.severity} / ${alert.status}`}
      footer={<>
        <Button onClick={() => { const r = run((s, a) => acknowledge(s, a, [alert.id])); if (r.ok) toast("Acknowledged. The condition is not resolved."); }} disabled={!act || alert.status !== "Open" || Boolean(alert.acknowledgedBy)}>Acknowledge</Button>
        <Button onClick={() => onDialog("assign")} disabled={!act || alert.status === "Resolved"}>Assign</Button>
        <Button onClick={() => onDialog("snooze")} disabled={!act || alert.status === "Resolved"}>Snooze</Button>
        <Button variant="primary" onClick={() => onDialog("resolve")} disabled={!act || alert.status === "Resolved"}>Resolve</Button>
      </>}>
      <dl className="kv">
        <div><dt>Trigger evidence</dt><dd style={{ maxWidth: 260 }}>{alert.trigger}</dd></div>
        <div><dt>Linked record</dt><dd><Link className="accent-text" href={action.to}>{alert.recordRef} ({action.label})</Link></dd></div>
        <div><dt>First seen</dt><dd>{formatShortDateTime(alert.firstSeen)}</dd></div><div><dt>Last seen</dt><dd>{formatShortDateTime(alert.lastSeen)}</dd></div><div><dt>Occurrences</dt><dd>{alert.occurrences}</dd></div>
        <div><dt>Assignee</dt><dd>{alert.assignee}</dd></div><div><dt>Due</dt><dd>{alert.dueAt ? formatShortDateTime(alert.dueAt) : MISSING}</dd></div>
        {alert.snoozeUntil ? <div><dt>Snoozed until</dt><dd>{formatShortDateTime(alert.snoozeUntil)}</dd></div> : null}
        {alert.resolution ? <div><dt>Resolution</dt><dd style={{ maxWidth: 260 }}>{alert.resolution.code}: {alert.resolution.note}</dd></div> : null}
      </dl>
      <Notice role="status">Pricing alerts reference evidence but never change a price. Acknowledge records who saw it; it does not resolve.</Notice>
      <section><h3 className="h3">History</h3><ul className="timeline mt-2">{[...alert.history].reverse().map((h, i) => <li key={i}><strong>{h.action}</strong><span className="meta">{h.actor} / {formatShortDateTime(h.at)}</span></li>)}</ul></section>
    </Drawer>
  );
}

function SnoozeDialog({ open, onClose, ids }: { open: boolean; onClose: () => void; ids: string[] }) {
  const { run } = useWorkspace();
  const toast = useToast();
  const [choice, setChoice] = useState<SnoozeChoice>("1h");
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (open) { setChoice("1h"); setUntil(""); setReason(""); setErrors({}); } }, [open]);
  return (
    <Dialog open={open} onClose={onClose} dirty={Boolean(reason)} title="Snooze alert" description="Needs a reason and a duration. The absolute time and timezone are stored; the alert reopens at expiry if the condition persists." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { const r = run((s, a) => snooze(s, a, ids[0], choice, reason, until)); if (!r.ok) { setErrors(r.fields ?? { form: r.message }); return; } toast("Snoozed. It reopens automatically if the condition persists."); onClose(); }}>Save snooze</Button></>}>
      <FormSummary errors={errors} />
      <fieldset className="radio-group"><legend className="label">Duration</legend>
        {([["1h", "1 hour"], ["tomorrow", "Tomorrow 09:00"], ["custom", "Custom"]] as const).map(([v, l]) => <label className="check" key={v}><input type="radio" name="snooze" checked={choice === v} onChange={() => setChoice(v)} /><span>{l}</span></label>)}
      </fieldset>
      {choice === "custom" ? <TextField label="Until (IST)" type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} error={errors.until} /> : null}
      <TextArea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} />
    </Dialog>
  );
}

function AssignDialog({ open, onClose, ids }: { open: boolean; onClose: () => void; ids: string[] }) {
  const { state, run } = useWorkspace();
  const toast = useToast();
  const [who, setWho] = useState("");
  const [due, setDue] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setWho(""); setDue(""); setError(""); } }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title={`Assign ${ids.length} alert${ids.length > 1 ? "s" : ""}`} description="Choose permitted staff and an optional due date. Staff are notified after the confirmed save." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { const r = run((s, a) => assignAlerts(s, a, ids, who, due)); if (!r.ok) { setError(r.fields?.assignee ?? r.message); return; } toast(`${r.count} assigned to ${who}.`); onClose(); }}>Save assignment</Button></>}>
      <SelectField label="Assignee" required value={who} onChange={(e) => setWho(e.target.value)} options={state.team.filter((t) => t.status === "Active").map((t) => t.name)} placeholder="Choose staff" error={error} />
      <TextField label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
    </Dialog>
  );
}

function ResolveDialog({ open, onClose, id }: { open: boolean; onClose: () => void; id?: string }) {
  const { run, state } = useWorkspace();
  const toast = useToast();
  const alert = state.alerts.find((a) => a.id === id);
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [fp, setFp] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (open) { setCode(""); setNote(""); setFp(false); setErrors({}); } }, [open]);
  return (
    <Dialog open={open} onClose={onClose} dirty={Boolean(note)} title="Resolve alert" description="Needs a resolution code and note. System-managed integration alerts resolve only after a successful health check." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { const r = run((s, a) => resolve(s, a, id!, code, note, fp)); if (!r.ok) { setErrors(r.fields ?? { form: r.message }); if (!r.fields) toast(r.message, "error"); return; } toast("Resolved. The audit trail is kept; it reopens if a new occurrence is detected."); onClose(); }}>Resolve</Button></>}>
      <FormSummary errors={errors} />
      <SelectField label="Resolution code" required value={code} onChange={(e) => setCode(e.target.value)} options={RESOLUTION_CODES.map((r) => ({ value: r.code, label: r.label }))} placeholder="Choose a code" error={errors.code} disabled={fp} />
      <TextArea label="Note" required value={note} onChange={(e) => setNote(e.target.value)} error={errors.note} />
      {alert?.type === "Integration" ? <Check label="Dismiss as a false positive (reason in the note)" checked={fp} onChange={setFp} /> : null}
    </Dialog>
  );
}

function RulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, run } = useWorkspace();
  const toast = useToast();
  const [form, setForm] = useState({ reviewThresholdDays: 30, ageingDays: 45, staleFeedHours: 24, leadResponseMinutes: 60 });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (open) { const p = state.policy; setForm({ reviewThresholdDays: p.reviewThresholdDays, ageingDays: p.ageingDays, staleFeedHours: p.staleFeedHours, leadResponseMinutes: p.leadResponseMinutes }); setErrors({}); } }, [open, state.policy]);
  const affected = previewRuleImpact(state, form.reviewThresholdDays, (id) => { const v = state.vehicles.find((x) => x.id === id); return v ? stockAgeDays(v, SNAPSHOT_AT) : 0; });
  const num = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: Number(e.target.value.replace(/\D/g, "")) });
  return (
    <Dialog open={open} onClose={onClose} dirty={JSON.stringify(form) !== JSON.stringify({ reviewThresholdDays: state.policy.reviewThresholdDays, ageingDays: state.policy.ageingDays, staleFeedHours: state.policy.staleFeedHours, leadResponseMinutes: state.policy.leadResponseMinutes })} title="Rule settings" description={`Rules version ${state.policy.rulesVersion}. Saving creates version ${state.policy.rulesVersion + 1}.`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { const r = run((s, a) => updateRules(s, a, form)); if (!r.ok) { setErrors(r.fields ?? { form: r.message }); return; } toast(`Rules version ${state.policy.rulesVersion + 1} saved.`); onClose(); }}>Save rules</Button></>}>
      <FormSummary errors={errors} />
      <div className="form-grid">
        <TextField label="Price review after (days in stock)" inputMode="numeric" value={String(form.reviewThresholdDays)} onChange={num("reviewThresholdDays")} error={errors.reviewThresholdDays} />
        <TextField label="Ageing threshold (days)" inputMode="numeric" value={String(form.ageingDays)} onChange={num("ageingDays")} error={errors.ageingDays} />
        <TextField label="Stale feed after (hours)" inputMode="numeric" value={String(form.staleFeedHours)} onChange={num("staleFeedHours")} error={errors.staleFeedHours} />
        <TextField label="Lead response SLA (minutes)" inputMode="numeric" value={String(form.leadResponseMinutes)} onChange={num("leadResponseMinutes")} error={errors.leadResponseMinutes} />
      </div>
      <Notice role="status">Preview: {affected} available vehicle{affected === 1 ? "" : "s"} are older than {form.reviewThresholdDays} days and would be in scope for price-review checks. SLA clocks use configured business hours; calendar and business durations are named in tooltips and exports.</Notice>
    </Dialog>
  );
}
