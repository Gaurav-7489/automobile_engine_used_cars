"use client";

import type { StatePrices } from "@/lib/server/state-prices";
import { formatMoney, formatPercent, MISSING } from "@/lib/format";
import { useRemote } from "../use-remote";
import { EmptyState, ErrorPanel, PageHead, SelectField, TableSkeleton } from "../ui";
import { useUrlState } from "../workspace";

const rupeesToPaise = (value: number) => value * 100;

/** One question, one table: what is this model listed for in each state, and how does that compare with ours? */
export function StatePricesPage() {
  const url = useUrlState();
  const pick = url.get("car", "");
  const [make, model] = pick.includes("|") ? pick.split("|") : ["", ""];
  const remote = useRemote<StatePrices>(`/api/state-prices?${new URLSearchParams({ make, model }).toString()}`);
  const data = remote.data;
  // Bars span the cheapest to the dearest listing on the page, so differences between states are visible.
  const floor = Math.min(...(data?.states ?? []).map((s) => s.low), Infinity);
  const span = Math.max(1, Math.max(...(data?.states ?? []).map((s) => s.high), 0) - (Number.isFinite(floor) ? floor : 0));
  const at = (v: number) => ((v - (Number.isFinite(floor) ? floor : 0)) / span) * 100;

  return (
    <div className="page">
      <PageHead title="Prices by state" lead="What dealers are asking for a car in each state." />
      {data && data.models.length > 0 ? (
        <div className="state-pick">
          <SelectField label="Car" value={pick} onChange={(e) => url.set({ car: e.target.value || null })} placeholder="All cars"
            options={data.models.map((m) => ({ value: `${m.make}|${m.model}`, label: `${m.make} ${m.model} (${m.cars})` }))} />
        </div>
      ) : null}
      {!data && remote.status !== "error" ? <TableSkeleton rows={6} columns={5} title="Prices by state" /> : null}
      {remote.status === "error" && !data ? <ErrorPanel title="Prices by state could not load" message={remote.error} onRetry={remote.reload} /> : null}
      {data && data.states.length === 0 ? (
        <EmptyState title="No published cars to compare yet">Prices appear here as dealerships publish cars with a price. Publish yours from Inventory to add your state.</EmptyState>
      ) : null}
      {data && data.states.length > 0 ? (
        <>
          <div className="table-wrap fit">
            <table className="data-table" aria-label="Asking prices by state">
              <thead><tr><th>State</th><th className="num">Typical price</th><th className="only-desktop">Lowest to highest</th><th className="num">{data.home ? `vs ${data.home}` : "Difference"}</th></tr></thead>
              <tbody>
                {data.states.map((s) => (
                  <tr key={s.state}>
                    <td><span className="row-title">{s.state}</span>{s.state === data.home ? <span className="sub">Your state</span> : null}</td>
                    <td className="num"><strong>{formatMoney(rupeesToPaise(s.median))}</strong><span className="sub">{s.cars} car{s.cars === 1 ? "" : "s"}{s.thin ? " · few" : ""}</span></td>
                    <td className="only-desktop">
                      <span className="price-range" aria-hidden="true"><span style={{ left: `${Math.min(98.5, at(s.low))}%`, width: `${Math.max(1.5, at(s.high) - at(s.low))}%` }} /></span>
                      <span className="sub">{formatMoney(rupeesToPaise(s.low))} to {formatMoney(rupeesToPaise(s.high))}</span>
                    </td>
                    <td className="num">{s.state === data.home ? MISSING : s.vsHome === null ? MISSING : <span className={s.vsHome < 0 ? "tone-accent" : ""}>{formatPercent(s.vsHome, { signed: true })}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="meta">Asking prices from {data.totalCars} published car{data.totalCars === 1 ? "" : "s"} on VandLabs, not sale prices. “Few” means under five cars, so treat that figure as a guide only. Moving a car between states adds transport and re-registration cost.</p>
        </>
      ) : null}
    </div>
  );
}
