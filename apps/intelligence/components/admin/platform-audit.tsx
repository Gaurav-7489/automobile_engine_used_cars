"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { Button, EmptyState, ErrorPanel, PanelSkeleton, SelectField, TextField } from "../ui";
import { useRemote } from "../use-remote";

type Row = { id: string; tenantId: string; organization: string; actor: string; actorName: string; action: string; subject: string; detail: string; at: string };

/** The platform audit trail across dealerships: who did what to which dealership, newest first, searched and paged on the server. */
export function PlatformAudit({ dealerships }: { dealerships: { tenantId: string; organization: string }[] }) {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [tenant, setTenant] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { const h = window.setTimeout(() => { setTerm(q.trim()); setPage(1); }, 300); return () => window.clearTimeout(h); }, [q]);
  const remote = useRemote<{ rows: Row[]; total: number }>(`/api/admin/audit?page=${page}&size=50${tenant ? `&tenant=${tenant}` : ""}${term ? `&q=${encodeURIComponent(term)}` : ""}`);
  const total = remote.data?.total ?? 0;
  return (
    <section className="card stack" aria-labelledby="pa-h">
      <h2 className="h2" id="pa-h">Platform audit</h2>
      <p className="muted">Append-only record of privileged actions: dealership creation, access changes, suspensions and entitlement changes.</p>
      <div className="form-grid">
        <TextField label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Dealership, person or action" />
        <SelectField label="Dealership" value={tenant} onChange={(e) => { setTenant(e.target.value); setPage(1); }} options={dealerships.map((d) => ({ value: d.tenantId, label: d.organization }))} placeholder="All dealerships" />
      </div>
      {remote.status === "loading" && !remote.data ? <PanelSkeleton rows={5} title="Platform audit" /> : null}
      {remote.status === "error" && !remote.data ? <ErrorPanel title="The audit trail could not load" onRetry={remote.reload} /> : null}
      {remote.data && !remote.data.rows.length ? <EmptyState title="No audit events match">Nothing has been recorded for this search yet.</EmptyState> : null}
      {remote.data?.rows.length ? (
        <div className="table-wrap" aria-busy={remote.status === "refreshing" && !remote.background}>
          <table className="data-table dense"><caption className="sr-only">Platform audit events</caption>
            <thead><tr><th>Time</th><th>Dealership</th><th>Actor</th><th>Action</th><th>Subject</th><th>Detail</th></tr></thead>
            <tbody>{remote.data.rows.map((r) => <tr key={r.id}><td style={{ whiteSpace: "nowrap" }}>{formatDateTime(r.at)}</td><td>{r.organization}</td><td>{r.actorName || r.actor}</td><td>{r.action}</td><td>{r.subject}</td><td className="meta" style={{ maxWidth: 280, overflowWrap: "anywhere" }}>{r.detail}</td></tr>)}</tbody>
          </table>
        </div>
      ) : null}
      {total > 50 ? <div className="pager"><span className="meta">Page {page} of {Math.ceil(total / 50)} / {total} events</span><div className="row-flex"><Button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button disabled={page * 50 >= total} onClick={() => setPage(page + 1)}>Next</Button></div></div> : null}
    </section>
  );
}
