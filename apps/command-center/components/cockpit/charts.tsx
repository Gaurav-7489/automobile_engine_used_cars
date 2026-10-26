import Link from "next/link";
import type { Insight } from "@vandlabs/data/capital-insights";

export interface DivergingRow { key: string; label: string; sub?: string; value: number; display: string; note?: string }
/**
 * One axis around a zero baseline: above the line extends right (blue), below extends left (red).
 * The sign is always written in the value ("+₹15,000" / "−₹45,000") and in the tooltip, so the
 * direction never relies on colour. Every value is repeated in the table view.
 */
export function DivergingBars({ rows, caption, positiveLabel, negativeLabel, valueHeading, empty }: { rows: DivergingRow[]; caption: string; positiveLabel: string; negativeLabel: string; valueHeading: string; empty: string }) {
  if (!rows.length) return <p className="ck-empty">{empty}</p>;
  const reach = Math.max(1, ...rows.map(r => Math.abs(r.value)));
  return <figure className="ck-chart">
    <figcaption>{caption}</figcaption>
    <p className="ck-legend" aria-hidden="true"><span><i data-side="neg" />{negativeLabel}</span><span><i data-side="pos" />{positiveLabel}</span></p>
    <ul className="ck-div">
      {rows.map(row => <li key={row.key} tabIndex={0} data-tip={`${row.label}: ${row.display}${row.note ? ` · ${row.note}` : ""}`} data-sign={row.value < 0 ? "neg" : "pos"}>
        <span className="ck-div-label">{row.label}{row.sub ? <small>{row.sub}</small> : null}</span>
        <span className="ck-div-track" aria-hidden="true"><i style={{ width: `${Math.max(row.value === 0 ? 0 : 1.5, Math.abs(row.value) / reach * 50)}%` }} /></span>
        <b className="ck-div-value">{row.display}</b>
      </li>)}
    </ul>
    <details className="ck-table"><summary>View as table</summary>
      <table><thead><tr><th scope="col">Vehicle</th><th scope="col">{valueHeading}</th><th scope="col">Detail</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.key}><th scope="row">{row.label}</th><td>{row.display}</td><td>{row.note ?? "—"}</td></tr>)}</tbody></table>
    </details>
  </figure>;
}

export interface StackPart { key: string; label: string; value: number; display: string }
/** A single stacked bar with a 2px surface gap between segments, a legend (always, for two or more series), and a table. */
export function StackedBar({ parts, caption, total, valueHeading }: { parts: StackPart[]; caption: string; total: string; valueHeading: string }) {
  const sum = parts.reduce((n, p) => n + p.value, 0) || 1;
  const shown = parts.filter(p => p.value > 0);
  return <figure className="ck-chart">
    <figcaption>{caption}</figcaption>
    <div className="ck-stack" role="img" aria-label={`${caption}: ${parts.map(p => `${p.label} ${p.display}`).join(", ")}`}>
      {shown.map(p => <i key={p.key} data-slot={parts.indexOf(p) + 1} tabIndex={0} data-tip={`${p.label}: ${p.display} · ${Math.round(p.value / sum * 1000) / 10}% of ${total}`} style={{ flexGrow: p.value }} />)}
    </div>
    <ul className="ck-key">
      {parts.map(p => <li key={p.key}><i data-slot={parts.indexOf(p) + 1} aria-hidden="true" /><span>{p.label}</span><b>{p.display}</b><small>{Math.round(p.value / sum * 1000) / 10}%</small></li>)}
    </ul>
    <details className="ck-table"><summary>View as table</summary>
      <table><thead><tr><th scope="col">Cost type</th><th scope="col">{valueHeading}</th><th scope="col">Share</th></tr></thead>
        <tbody>{parts.map(p => <tr key={p.key}><th scope="row">{p.label}</th><td>{p.display}</td><td>{Math.round(p.value / sum * 1000) / 10}%</td></tr>)}</tbody></table>
    </details>
  </figure>;
}

const toneGlyph: Record<Insight["tone"], string> = { risk: "▲", watch: "●", info: "○", good: "✓" };
const toneLabel: Record<Insight["tone"], string> = { risk: "Risk", watch: "Watch", info: "Note", good: "Clear" };
/** Plain-language findings; each states the recorded numbers behind it. */
export function InsightList({ insights }: { insights: Insight[] }) {
  return <ul className="ck-insights">
    {insights.map(insight => <li key={insight.id} data-tone={insight.tone}>
      <span className="ck-tone"><span aria-hidden="true">{toneGlyph[insight.tone]}</span>{toneLabel[insight.tone]}</span>
      <div><strong>{insight.title}</strong><p>{insight.body}</p>
        {insight.evidence.length ? <ul className="ck-evidence">{insight.evidence.map(line => <li key={line}>{line}</li>)}</ul> : null}
        {insight.href ? <Link href={insight.href} className="ck-open">Review <span aria-hidden="true">→</span></Link> : null}
      </div>
    </li>)}
  </ul>;
}
