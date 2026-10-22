"use client";

import { useId, useState } from "react";
import { Button } from "./ui";

export type BarDatum = { label: string; values: number[]; ariaLabel?: string };

/** Grouped vertical bars with visible scale, legend, table alternative, tooltip on hover/focus and click-through. */
export function GroupedBars({ title, unit, data, series, onSelect, format = (v) => String(v), height = 232, scaleMax }: {
  title: string; unit: string; data: BarDatum[]; series: { name: string; color: string }[]; onSelect?: (index: number, seriesIndex: number) => void; format?: (v: number) => string; height?: number; scaleMax?: number;
}) {
  const [showTable, setShowTable] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const tableId = useId();
  const max = scaleMax ?? Math.max(4, Math.ceil(Math.max(1, ...data.flatMap((d) => d.values)) / 4) * 4);
  const W = 640;
  const left = 36;
  const bottom = 28;
  const plotH = height - bottom - 12;
  const groupW = (W - left) / Math.max(1, data.length);
  const barW = Math.min(22, (groupW - 16) / series.length);
  const ticks = [0, 1 / 3, 2 / 3, 1].map((f) => Math.round(max * f * 10) / 10);
  return (
    <div className="chart-card" style={{ position: "relative" }}>
      <div className="chart-title">
        <span className="legend" role="list" aria-label="Legend">
          {series.map((s) => <span key={s.name} role="listitem"><span className="swatch" style={{ background: s.color }} />{s.name}</span>)}
        </span>
        <Button size="sm" variant="ghost" aria-pressed={showTable} aria-controls={tableId} onClick={() => setShowTable((v) => !v)}>{showTable ? "View chart" : "View data"}</Button>
      </div>
      {showTable ? (
        <div id={tableId} className="table-wrap fit"><table className="chart-data-table"><caption className="sr-only">{title}, {unit}</caption>
          <thead><tr><th scope="col">Period</th>{series.map((s) => <th scope="col" key={s.name} className="num">{s.name}</th>)}</tr></thead>
          <tbody>{data.map((d) => <tr key={d.label}><th scope="row">{d.label}</th>{d.values.map((v, i) => <td key={i} className="num">{format(v)}</td>)}</tr>)}</tbody></table></div>
      ) : (
        <div style={{ position: "relative" }}>
          <svg className="chart-svg" viewBox={`0 0 ${W} ${height}`} role="group" aria-label={`${title}. ${unit}. Scale 0 to ${format(max)}.`}>
            <text x={left} y={8} textAnchor="start" style={{ fontSize: 11 }}>{unit}</text>
            {ticks.map((t) => {
              const y = 14 + plotH - (t / max) * plotH;
              return <g key={t}><line className="grid" x1={left} x2={W} y1={y} y2={y} /><text x={left - 8} y={y + 4} textAnchor="end">{format(t)}</text></g>;
            })}
            {data.map((d, i) => {
              const gx = left + i * groupW + (groupW - barW * series.length - 4 * (series.length - 1)) / 2;
              return (
                <g key={d.label}>
                  {d.values.map((v, s) => {
                    const h = Math.max(v > 0 ? 2 : 0, (v / max) * plotH);
                    const x = gx + s * (barW + 4);
                    const y = 14 + plotH - h;
                    const text = `${d.label}: ${series[s].name} ${format(v)}`;
                    return (
                      <g key={s}>
                        <rect className="chart-bar" x={x} y={y} width={barW} height={h} rx={3} fill={series[s].color} tabIndex={0} role="img" aria-label={d.ariaLabel ?? text}
                          onMouseEnter={() => setTip({ x: ((x + barW / 2) / W) * 100, y: ((y) / height) * 100, text })} onMouseLeave={() => setTip(null)} onFocus={() => setTip({ x: ((x + barW / 2) / W) * 100, y: (y / height) * 100, text })} onBlur={() => setTip(null)}
                          onClick={() => onSelect?.(i, s)} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && onSelect) { e.preventDefault(); onSelect(i, s); } }} />
                        {v > 0 ? <text x={x + barW / 2} y={y - 4} textAnchor="middle" style={{ fontSize: 10, fill: "var(--text)" }}>{format(v)}</text> : null}
                      </g>
                    );
                  })}
                  <text x={left + i * groupW + groupW / 2} y={height - 8} textAnchor="middle">{d.label}</text>
                </g>
              );
            })}
          </svg>
          {tip ? <div className="chart-tooltip" style={{ left: `${tip.x}%`, top: `${tip.y}%`, transform: "translate(-50%, -140%)" }}>{tip.text}</div> : null}
        </div>
      )}
    </div>
  );
}

/** Single-series vertical bars (profit by month). */
export function SimpleBars({ title, unit, data, color = "var(--accent)", format, onSelect, height = 232, scaleMax }: { title: string; unit: string; data: { label: string; value: number }[]; color?: string; format?: (v: number) => string; onSelect?: (index: number) => void; height?: number; scaleMax?: number }) {
  return <GroupedBars title={title} unit={unit} data={data.map((d) => ({ label: d.label, values: [d.value] }))} series={[{ name: title, color }]} format={format} onSelect={onSelect ? (i) => onSelect(i) : undefined} height={height} scaleMax={scaleMax} />;
}

export type HBarDatum = { label: string; value: number; display: string; tone?: "accent" | "warn" | "info"; onSelect?: () => void; ariaLabel?: string };

/** Horizontal bars for stock age, capital by age and the lead funnel. Never encode status by colour alone: labels and values are always visible. */
export function HBars({ data, max }: { data: HBarDatum[]; max?: number }) {
  const top = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="hbars" role="list">
      {data.map((d) => (
        <div className="hbar" role="listitem" key={d.label}>
          {d.onSelect ? <button type="button" onClick={d.onSelect} aria-label={d.ariaLabel ?? `${d.label}: ${d.display}. Open matching records`}>{d.label}</button> : <span className="muted">{d.label}</span>}
          <span className="track"><span className={`fill ${d.tone === "warn" ? "warn" : d.tone === "info" ? "info" : ""}`} style={{ width: `${(d.value / top) * 100}%` }} /></span>
          <span className="value">{d.display}</span>
        </div>
      ))}
    </div>
  );
}

/** Horizontal median bars with Q1-Q3 whiskers (regional price comparison). */
export function RangeBars({ rows, axisMin, axisMax, format, selected, onSelect }: {
  rows: { key: string; label: string; sub: string; median: number | null; q1: number | null; q3: number | null; display: string; unavailable?: boolean }[]; axisMin: number; axisMax: number; format: (v: number) => string; selected?: string; onSelect?: (key: string) => void;
}) {
  const W = 700;
  const left = 150;
  const right = 90;
  const rowH = 62;
  const H = rows.length * rowH + 44;
  const scale = (v: number) => left + ((v - axisMin) / (axisMax - axisMin)) * (W - left - right);
  const ticks = [0, 1, 2, 3].map((i) => axisMin + ((axisMax - axisMin) * i) / 3);
  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Regional median asking price with interquartile range. Axis ${format(axisMin)} to ${format(axisMax)}.`}>
      {ticks.map((t) => <g key={t}><line className="grid" x1={scale(t)} x2={scale(t)} y1={4} y2={H - 28} /><text x={scale(t)} y={H - 10} textAnchor="middle">{format(t)}</text></g>)}
      {rows.map((r, i) => {
        const y = 14 + i * rowH;
        const active = selected === r.key;
        return (
          <g key={r.key} role="button" tabIndex={0} aria-pressed={active} aria-label={r.unavailable ? `${r.label}: unavailable` : `${r.label}, ${r.sub}, median ${r.display}${r.q1 !== null && r.q3 !== null ? `, interquartile range ${format(r.q1)} to ${format(r.q3)}` : ""}`} style={{ cursor: "pointer" }}
            onClick={() => onSelect?.(r.key)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(r.key); } }}>
            <text x={0} y={y + 14} style={{ fill: "var(--text)", fontSize: 13, fontWeight: 600 }}>{r.label}</text>
            <text x={0} y={y + 32}>{r.sub}</text>
            {r.unavailable || r.median === null ? (
              <text x={left} y={y + 24} style={{ fill: "var(--warning)", fontSize: 12 }}>Unavailable: no qualifying listings</text>
            ) : (
              <>
                <rect x={left} y={y + 8} width={Math.max(2, scale(r.median) - left)} height={20} rx={4} fill={active ? "var(--accent)" : "#4a5b7d"} />
                {r.q1 !== null && r.q3 !== null ? (
                  <g stroke="var(--text)" strokeWidth={1.5}><line x1={scale(r.q1)} x2={scale(r.q3)} y1={y + 18} y2={y + 18} /><line x1={scale(r.q1)} x2={scale(r.q1)} y1={y + 12} y2={y + 24} /><line x1={scale(r.q3)} x2={scale(r.q3)} y1={y + 12} y2={y + 24} /></g>
                ) : null}
                <text x={W} y={y + 23} textAnchor="end" style={{ fill: "var(--text)", fontSize: 13, fontWeight: 600 }}>{r.display}</text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Daily spend line (₹) with a separate leads count panel is rendered by the caller; this draws spend only. */
export function SpendLine({ data, format }: { data: { label: string; value: number }[]; format: (v: number) => string }) {
  const W = 640;
  const H = 180;
  const left = 48;
  const max = Math.max(1, ...data.map((d) => d.value));
  const top = Math.ceil(max / 100) * 100;
  const x = (i: number) => left + (i / Math.max(1, data.length - 1)) * (W - left - 8);
  const y = (v: number) => 12 + (H - 40) - (v / top) * (H - 40);
  const path = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.value)}`).join(" ");
  return (
    <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Daily spend, ${format(0)} to ${format(top)}`}>
      {[0, 0.5, 1].map((f) => <g key={f}><line className="grid" x1={left} x2={W} y1={y(top * f)} y2={y(top * f)} /><text x={left - 6} y={y(top * f) + 4} textAnchor="end">{format(Math.round(top * f))}</text></g>)}
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
      {data.map((d, i) => (i % 3 === 0 || i === data.length - 1 ? <text key={d.label} x={x(i)} y={H - 6} textAnchor="middle">{d.label}</text> : null))}
    </svg>
  );
}
