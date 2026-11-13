"use client";

import { useEffect, useState } from "react";
import type { HealthRow, Rating } from "@/lib/server/health-review";
import { Badge, EmptyState, ErrorPanel, PanelSkeleton } from "../ui";

const TONE: Record<Rating, "accent" | "warn" | "danger"> = { green: "accent", amber: "warn", red: "danger" };
const DIMS: { key: keyof Omit<HealthRow, "tenantId" | "organization" | "overall">; label: string }[] = [
  { key: "data", label: "Data quality" }, { key: "marketing", label: "Marketing use" }, { key: "channels", label: "AI channels" }, { key: "leads", label: "Lead workflow" }, { key: "management", label: "Management" },
];

/** The monthly customer health review (playbook 11.3) for every dealership, from live platform data. */
export function HealthReview() {
  const [data, setData] = useState<{ rows: HealthRow[] } | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const load = () => { setError(""); fetch("/api/admin/health").then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b?.error?.message); setData(b); }).catch((e: Error) => setError(e.message || "Could not load.")); };
  useEffect(load, []);
  if (error) return <ErrorPanel title="Health review could not load" message={error} onRetry={load} />;
  if (!data) return <PanelSkeleton rows={5} />;
  if (!data.rows.length) return <EmptyState title="No dealerships yet">Health appears here once a dealership is using VandLabs.</EmptyState>;
  return (
    <div className="adm-stack">
      <p className="muted">Five indicators from the last 30 days of each dealership&rsquo;s own use. Thresholds are starting assumptions; use them to start the monthly conversation, not to judge it.</p>
      <div className="table-wrap fit">
        <table className="data-table" aria-label="Customer health">
          <thead><tr><th>Dealership</th>{DIMS.map((d) => <th key={d.key} className="only-desktop">{d.label}</th>)}<th>Overall</th></tr></thead>
          <tbody>{data.rows.map((r) => (
            <tr key={r.tenantId}>
              <td>
                <button type="button" className="row-title" onClick={() => setOpen(open === r.tenantId ? null : r.tenantId)} aria-expanded={open === r.tenantId}>{r.organization}</button>
                {open === r.tenantId ? <ul className="plan-list">{DIMS.map((d) => <li key={d.key}><strong>{d.label}:</strong> {r[d.key].detail}</li>)}</ul> : <span className="sub">Show details</span>}
              </td>
              {DIMS.map((d) => <td key={d.key} className="only-desktop"><Badge tone={TONE[r[d.key].rating]}>{r[d.key].rating}</Badge></td>)}
              <td><Badge tone={TONE[r.overall]}>{r.overall}</Badge></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
