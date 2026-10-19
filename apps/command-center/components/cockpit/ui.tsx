import Link from "next/link";
import type { CockpitAction, ActionSeverity } from "@vandlabs/data/cockpit";
import { TaskStatusButton } from "../task-status-button";

export interface Kpi { label: string; value: string; detail?: string; unavailable?: boolean; href?: string; linkLabel?: string }

/** Graphite instrument band: the one place a screen leads with its headline numbers. */
export function KpiBand({ kpis, label }: { kpis: Kpi[]; label: string }) {
  return <section className="ck-band" aria-label={label}>
    {kpis.map(kpi => <article key={kpi.label} className="ck-kpi" data-unavailable={kpi.unavailable || undefined}>
      <span className="ck-kpi-label">{kpi.label}</span>
      <strong className="ck-kpi-value">{kpi.value}</strong>
      {kpi.detail ? <small>{kpi.detail}</small> : null}
      {kpi.href ? <Link className="ck-kpi-link" href={kpi.href}>{kpi.linkLabel ?? "Open"} <span aria-hidden="true">→</span></Link> : null}
    </article>)}
  </section>;
}

export interface BarRow { label: string; value: number; display: string; note?: string; tone?: 1 | 2 | 3 | 4 }
/**
 * Horizontal bars from one baseline. One series, so no legend: the caption names it. Values sit at
 * the bar tip in text ink, every value is also in the table view, and the same detail appears as a
 * tooltip on hover and keyboard focus.
 */
export function Bars({ rows, caption, valueHeading, empty }: { rows: BarRow[]; caption: string; valueHeading: string; empty?: string }) {
  const top = Math.max(1, ...rows.map(r => r.value));
  if (!rows.length || rows.every(r => r.value === 0) && empty) return <p className="ck-empty">{empty ?? "No data to chart."}</p>;
  return <figure className="ck-chart">
    <figcaption>{caption}</figcaption>
    <ul className="ck-bars">
      {rows.map(row => <li key={row.label} tabIndex={0} data-tip={`${row.label}: ${row.display}${row.note ? ` · ${row.note}` : ""}`}>
        <span className="ck-bar-label">{row.label}</span>
        <span className="ck-bar-track"><i data-tone={row.tone ?? 2} style={{ width: `${Math.max(row.value > 0 ? 2 : 0, (row.value / top) * 100)}%` }} /></span>
        <b className="ck-bar-value">{row.display}</b>
      </li>)}
    </ul>
    <details className="ck-table"><summary>View as table</summary>
      <table><thead><tr><th scope="col">Category</th><th scope="col">{valueHeading}</th><th scope="col">Note</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.display}</td><td>{row.note ?? "—"}</td></tr>)}</tbody></table>
    </details>
  </figure>;
}

export function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const ratio = limit > 0 ? used / limit : 0, level = used > limit ? "over" : ratio >= 0.9 ? "high" : "ok";
  return <div className="ck-meter" data-level={level}>
    <span>{label}</span>
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)} aria-valuetext={`${used} of ${limit}`}><i style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} /></div>
    <b>{used.toLocaleString("en-IN")} / {limit.toLocaleString("en-IN")}</b>
  </div>;
}

const glyph: Record<ActionSeverity, string> = { critical: "▲", high: "●", medium: "◆", info: "○" };
const severityLabel: Record<ActionSeverity, string> = { critical: "Critical", high: "High", medium: "Medium", info: "Info" };
export function SeverityTag({ severity }: { severity: ActionSeverity }) {
  return <span className="ck-sev" data-severity={severity}><span aria-hidden="true">{glyph[severity]}</span>{severityLabel[severity]}</span>;
}
const waited = (a: CockpitAction) => a.waiting ? (a.waiting.unit === "hours" && a.waiting.value >= 48 ? `${Math.floor(a.waiting.value / 24)} days` : `${a.waiting.value} ${a.waiting.unit}`) : null;

/**
 * Actions are derived from recorded data, so they resolve themselves when the cause is fixed.
 * Tasks can be completed in place through the existing authorized API; everything else links to
 * the record that needs a decision.
 */
export function ActionList({ actions, canResolve, limit, emptyText }: { actions: CockpitAction[]; canResolve: boolean; limit?: number; emptyText?: string }) {
  const shown = limit ? actions.slice(0, limit) : actions;
  if (!shown.length) return <p className="ck-empty">{emptyText ?? "Nothing needs action. Every follow-up, task, visit and aged vehicle with recorded evidence is within policy."}</p>;
  return <ol className="ck-actions" aria-label="Required actions">
    {shown.map(action => <li key={action.id} data-severity={action.severity} id={`action-${action.id.replace(/[^a-z0-9]+/gi, "-")}`}>
      <SeverityTag severity={action.severity} />
      <div className="ck-act-body">
        <strong>{action.title}</strong>
        <p>{action.detail}{waited(action) ? <> · <span className="ck-wait">waiting {waited(action)}</span></> : null}</p>
        <details><summary>Why this is flagged</summary><ul>{action.evidence.map(line => <li key={line}>{line}</li>)}</ul></details>
      </div>
      <div className="ck-act-ctl">
        {action.resolve && canResolve ? <TaskStatusButton taskId={action.resolve.taskId} title={action.title} completed={false} version={action.resolve.version} /> : null}
        <Link href={action.href} className="ck-open" aria-label={`Open: ${action.title}`}>Open <span aria-hidden="true">→</span></Link>
      </div>
    </li>)}
  </ol>;
}
