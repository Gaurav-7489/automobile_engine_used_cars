"use client";

import Link from "next/link";
import { formatLakh2, formatMoney, MISSING } from "@/lib/format";
import type { StockReport } from "@/lib/server/stock-model";
import { RemotePanel } from "../panel";
import { Badge, Button, EmptyState, Kpi, Notice, PageHead, SelectField } from "../ui";
import { useRemote } from "../use-remote";
import { useScopedHref, useUrlState, useWorkspace } from "../workspace";

const ACTION_LABEL = { inspect: "Complete record", follow_up: "Follow up", review_price: "Review price" } as const;

export function StockIntelligencePage() {
  const { scope } = useWorkspace();
  const url = useUrlState();
  const href = useScopedHref();
  const band = url.get("band"), action = url.get("action"), page = Math.max(1, Number(url.get("page")) || 1);
  const remote = useRemote<StockReport>(`/api/stock-intelligence?branches=${scope.ids.join(",")}&page=${page}${band ? `&band=${band}` : ""}${action ? `&action=${action}` : ""}`);
  const r = remote.data;
  const totalVehicles = r?.bands.reduce((s, b) => s + b.vehicles, 0) ?? 0;
  return (
    <div className="page">
      <PageHead title="Stock intelligence" lead="How long stock has been held, what it ties up, and what to review. Prompts only: nothing here changes a price or a record." />
      <RemotePanel title="Stock ageing" remote={remote} rows={6}>
        {r ? (
          <>
            <div className="kpi-grid">
              {r.bands.map((b, i) => (
                <Kpi key={b.label} label={b.label} value={b.vehicles} tone={i >= 2 ? "warn" : "accent"} onClick={() => url.set({ band: band === String(i) ? null : i, page: null })}
                  note={b.capitalPaise === null ? "Capital needs finance access" : `${formatLakh2(b.capitalPaise)} locked${b.costed < b.vehicles ? ` (${b.costed}/${b.vehicles} costed)` : ""}`} />
              ))}
            </div>
            {totalVehicles === 0 ? <EmptyState title="No stock to review">Vehicles in stock, reserved or in preparation appear here with their age.</EmptyState> : (
              <section className="card stack" aria-labelledby="si-h">
                <h2 className="h2" id="si-h">Vehicles</h2>
                <div className="form-grid">
                  <SelectField label="Age band" value={band} onChange={(e) => url.set({ band: e.target.value || null, page: null })} placeholder="All ages" options={r.bandLabels.map((l, i) => ({ value: String(i), label: l }))} />
                  <SelectField label="Review prompt" value={action} onChange={(e) => url.set({ action: e.target.value || null, page: null })} placeholder="Any" options={Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label }))} />
                </div>
                {!r.rows.length ? <EmptyState title="Nothing matches">Clear a filter to see more stock.</EmptyState> : (
                  <div className="table-wrap">
                    <table className="data-table"><caption className="sr-only">Stock ordered by age, oldest first</caption>
                      <thead><tr><th>Vehicle</th><th>Age</th><th>Status</th><th>Capital</th><th>Enquiries ({r.policy.lookbackDays}d)</th><th>Review</th></tr></thead>
                      <tbody>{r.rows.map((v) => (
                        <tr key={v.stockId}>
                          <td><Link href={href(`/app/inventory/${encodeURIComponent(v.stockId)}`)}>{v.stockId}</Link><div className="meta">{v.label}</div></td>
                          <td>{v.ageDays} days<div className="meta">{r.bandLabels[v.band]}</div></td>
                          <td>{v.status}</td>
                          <td>{v.capitalPaise === null ? MISSING : formatMoney(v.capitalPaise)}</td>
                          <td>{v.enquiries === null ? MISSING : `${v.enquiries} (${v.openLeads} open)`}</td>
                          <td>{v.recommendations.length ? v.recommendations.map((x) => <details key={x.action}><summary><Badge tone={x.action === "review_price" ? "warn" : "neutral"}>{ACTION_LABEL[x.action]}</Badge></summary><p className="meta">{x.reason}</p><ul className="meta">{x.evidence.map((e) => <li key={e}>{e}</li>)}</ul></details>) : <span className="meta">None</span>}</td>
                        </tr>))}</tbody>
                    </table>
                  </div>
                )}
                {r.total > r.size ? <div className="pager"><span className="meta">Page {r.page} of {Math.ceil(r.total / r.size)} / {r.total} vehicles</span><div className="row-flex"><Button disabled={page <= 1} onClick={() => url.set({ page: page - 1 })}>Previous</Button><Button disabled={page * r.size >= r.total} onClick={() => url.set({ page: page + 1 })}>Next</Button></div></div> : null}
              </section>
            )}
            <Notice><strong>How this is worked out.</strong> {r.assumptions.join(" ")} {r.unavailable.join(" ")}</Notice>
          </>
        ) : null}
      </RemotePanel>
    </div>
  );
}
