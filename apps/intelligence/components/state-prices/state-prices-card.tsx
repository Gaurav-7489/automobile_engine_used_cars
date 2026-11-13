"use client";

import Link from "next/link";
import type { StatePrices } from "@/lib/server/state-prices";
import { formatMoney, formatPercent } from "@/lib/format";
import { useRemote } from "../use-remote";
import { useScopedHref } from "../workspace";

/** What dealers ask for the same model in each state, beside the car itself. Asking prices from cars published on VandLabs. */
export function StatePricesCard({ make, model, asking }: { make: string; model: string; asking: number | null }) {
  const href = useScopedHref();
  const remote = useRemote<StatePrices>(`/api/state-prices?${new URLSearchParams({ make, model }).toString()}`);
  const states = remote.data?.states ?? [];
  const ours = asking === null ? null : asking / 100;
  return (
    <section className="card" aria-labelledby="sp-car">
      <div className="spread"><h2 className="h3" id="sp-car">{make} {model} in other states</h2>
        <Link className="accent-text" href={href("/app/state-prices", { car: `${make}|${model}` })}>All states</Link></div>
      {!remote.data ? <p className="meta mt-2">{remote.status === "error" ? "Could not load prices by state." : "Loading…"}</p> : states.length === 0 ? (
        <p className="meta mt-2">No other dealer on VandLabs has published a {make} {model} with a price yet.</p>
      ) : (
        <ul className="sp-list">
          {states.slice(0, 5).map((s) => {
            const vs = ours ? ((s.median - ours) / ours) * 100 : null;
            return (
              <li key={s.state}>
                <span><strong>{s.state}</strong>{s.state === remote.data!.home ? <span className="meta"> · your state</span> : null}<span className="meta"> · {s.cars} car{s.cars === 1 ? "" : "s"}{s.thin ? ", few" : ""}</span></span>
                <span className="num"><strong>{formatMoney(s.median * 100)}</strong>{vs !== null ? <span className={`meta ${vs < 0 ? "tone-accent" : ""}`}> {formatPercent(vs, { signed: true })}</span> : null}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="meta mt-2">Typical asking prices{ours ? ", compared with this car's price" : ""}. Not sale prices.</p>
    </section>
  );
}
