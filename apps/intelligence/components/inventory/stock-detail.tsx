"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { difference } from "@/lib/evidence";
import { grossAtAsking, landedCost, needsPriceReview, stockAgeDays } from "@/lib/finance";
import { formatDate, formatExact, formatKm, formatLakh2, formatMoney, formatPercent, MISSING } from "@/lib/format";
import { SNAPSHOT_AT } from "@/lib/time";
import { valuationFor } from "@/lib/valuation";
import { Panel } from "../panel";
import { Badge, Button, EmptyState, ErrorPanel, PageHead, PanelSkeleton } from "../ui";
import { useRemote } from "../use-remote";
import type { Lead, Sale, Vehicle } from "@/lib/domain";
import { VehicleArt } from "../vehicle-art";
import { useScopedHref, useWorkspace } from "../workspace";
import { EvidenceBadge } from "../market/common";
import { VehicleDrawer } from "./vehicle-drawer";

const LABEL = { available: "Available", reserved: "Reserved", preparation: "In preparation", sold: "Sold", archived: "Archived" } as const;

export function StockDetail({ id }: { id: string }) {
  const { state, scope, can, mergeRecords } = useWorkspace();
  const href = useScopedHref();
  const remote = useRemote<{ vehicle: Vehicle; leads: Lead[]; sale: Sale | null }>(`/api/inventory/${encodeURIComponent(id)}`, (d) => mergeRecords({ vehicles: [d.vehicle], leads: d.leads, sales: d.sale ? [d.sale] : [] }));
  // The cached record carries any change made on this device that the server has not echoed back yet.
  const vehicle = state.vehicles.find((v) => v.id === id) ?? remote.data?.vehicle;
  const [edit, setEdit] = useState(false);
  const valuation = useMemo(() => (vehicle ? valuationFor(vehicle) : null), [vehicle]);
  if (!vehicle && (remote.status === "loading" || remote.status === "refreshing")) return <div className="page"><PageHead title="Stock record" lead="Loading the record…" /><PanelSkeleton rows={6} title="Stock record" /></div>;
  if (!vehicle && remote.status === "error" && remote.code !== 404) return <div className="page"><PageHead title="Stock record" /><ErrorPanel title="This record could not load" onRetry={remote.reload} /></div>;
  if (!vehicle || !valuation) {
    return <div className="page"><PageHead title="Record not found" lead="This record does not exist or is not available to you." /><EmptyState title="Back to inventory" actions={<Link href={href("/app/inventory")} className="btn btn-primary">Back to inventory</Link>}>Inaccessible and missing records look the same by design.</EmptyState></div>;
  }
  const landed = landedCost(vehicle.costs);
  const gross = grossAtAsking(vehicle.asking, landed);
  const diff = vehicle.asking !== null ? difference(vehicle.asking, valuation.estimate) : null;
  const requests = state.priceRequests.filter((r) => r.vehicleId === vehicle.id);
  const campaigns = state.campaigns.filter((c) => c.vehicleId === vehicle.id);
  const leads = state.leads.filter((l) => l.vehicleId === vehicle.id);
  const sale = state.sales.find((s) => s.vehicleId === vehicle.id);

  return (
    <div className="page">
      <PageHead title={`${vehicle.make} ${vehicle.model} ${vehicle.variant}`} actions={<>
        {can("inventory.edit") && vehicle.status !== "sold" && vehicle.status !== "archived" ? <Button onClick={() => setEdit(true)}>Edit</Button> : null}
        {vehicle.status === "available" && can("price.view") ? <Link className="btn btn-primary" href={href("/app/pricing", { vehicle: vehicle.id })}>Review price</Link> : null}
      </>}>
        <p className="lead"><Link className="accent-text" href={href("/app/inventory")}>Inventory</Link> &gt; {vehicle.id} / {vehicle.year} / {vehicle.fuel} / {vehicle.transmission}</p>
      </PageHead>
      <div className="detail-hero">
        <VehicleArt label={vehicle.hasImages ? "Schematic vehicle image" : "No photos yet: labelled silhouette"} ratio="560 / 272" />
        <section className="card facts" aria-labelledby="stock-facts">
          <div className="spread"><h2 className="h3" id="stock-facts">Stock record / {state.branches.find((b) => b.id === vehicle.branchId)?.name}</h2><div className="row-flex"><Badge tone="accent">{LABEL[vehicle.status]}</Badge>{needsPriceReview(vehicle) ? <Badge tone="warn">Price review</Badge> : null}</div></div>
          <div className="price-pair"><div><div className="price-big" title={formatExact(vehicle.asking)}>{formatMoney(vehicle.asking)}</div><div className="meta">Asking price</div></div><div><div className="price-big" title={formatExact(landed)}>{formatMoney(landed)}</div><div className="meta">Landed cost</div></div></div>
          <p className="muted">{formatKm(vehicle.km)} km / {vehicle.owners} owner{vehicle.owners > 1 ? "s" : ""} / registration {vehicle.registration} / acquired {formatDate(vehicle.acquiredAt)} ({stockAgeDays(vehicle, SNAPSHOT_AT)} days) / version {vehicle.version}</p>
          {!vehicle.costComplete || !vehicle.hasImages ? <p className="warn-text">Attention: {[!vehicle.costComplete ? "cost evidence incomplete" : "", !vehicle.hasImages ? "no photo" : ""].filter(Boolean).join(", ")}.</p> : null}
        </section>
      </div>
      <div className="analysis">
        <Panel title="Market intelligence" rows={4} partialFail>
          <section className="card" aria-labelledby="mi">
            <h2 className="h3" id="mi">Market intelligence</h2>
            <dl className="kv mt-4">
              <div><dt>Estimated market value</dt><dd>{valuation.estimate === null ? `${MISSING} / insufficient evidence` : formatMoney(valuation.estimate)}</dd></div>
              <div><dt>Comparable range</dt><dd>{valuation.low === null ? MISSING : `${formatMoney(valuation.low)}-${formatMoney(valuation.high).replace("₹", "")}`}</dd></div>
              <div><dt>Asking vs estimate</dt><dd>{diff === null ? "Unknown" : formatPercent(diff, { signed: true })}</dd></div>
              <div><dt>Evidence</dt><dd><EvidenceBadge tier={valuation.tier} /> n = {valuation.n} / {valuation.methodVersion}</dd></div>
              <div><dt>Enquiries (14 days)</dt><dd>{vehicle.enquiries14d} / cohort median {vehicle.cohortMedianEnquiries}</dd></div>
            </dl>
          </section>
        </Panel>
        <section className="card" aria-labelledby="ledger">
          <h2 className="h3" id="ledger">Stock ledger</h2>
          <dl className="kv mt-4">
            {(["acquisition", "transport", "inspection", "refurbishment", "fees"] as const).map((k) => <div key={k}><dt>{k === "fees" ? "Purchase fees" : k[0].toUpperCase() + k.slice(1)}</dt><dd>{formatExact(vehicle.costs[k])}</dd></div>)}
            <div><dt>Landed cost</dt><dd>{formatExact(landed)}</dd></div>
            <div><dt>Estimated gross at asking</dt><dd className="tone-accent">{gross === null ? MISSING : formatLakh2(gross)}</dd></div>
          </dl>
          <p className="meta mt-4">Holding and selling costs are shown separately. Estimates never enter realized profit.{sale ? ` Sale ${sale.id} is recorded.` : ""}</p>
        </section>
      </div>
      <div className="analysis" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <section className="card" aria-labelledby="docs"><h2 className="h3" id="docs">Documents</h2><ul className="stack-sm" style={{ margin: "12px 0 0", paddingLeft: 18 }}>{vehicle.documents.length ? vehicle.documents.map((d) => <li key={d.name}>{d.name}: {d.provided ? "Provided" : "Not provided"}</li>) : <li>Not provided</li>}</ul></section>
        <section className="card" aria-labelledby="req"><h2 className="h3" id="req">Price requests</h2><ul className="stack-sm" style={{ margin: "12px 0 0", paddingLeft: 18 }}>{requests.length ? requests.map((r) => <li key={r.id}><Link className="accent-text" href={href(`/app/pricing/${r.id}`)}>{r.id}</Link> / {r.status}</li>) : <li>None</li>}</ul></section>
        <section className="card" aria-labelledby="lc"><h2 className="h3" id="lc">Advertising and leads</h2><ul className="stack-sm" style={{ margin: "12px 0 0", paddingLeft: 18 }}>{campaigns.map((c) => <li key={c.id}><Link className="accent-text" href={href(`/app/advertising/${c.id}`)}>{c.id}</Link> / {c.status}</li>)}<li>{leads.length} linked lead{leads.length === 1 ? "" : "s"}{leads.length && can("leads.view") ? <> / <Link className="accent-text" href={href("/app/leads", { vehicle: vehicle.id })}>Open leads</Link></> : null}</li></ul></section>
      </div>
      <VehicleDrawer key={`${edit}`} open={edit} onClose={() => setEdit(false)} vehicle={vehicle} defaultBranch={scope.ids[0] ?? ""} />
    </div>
  );
}
