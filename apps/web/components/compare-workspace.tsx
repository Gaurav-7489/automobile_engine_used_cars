"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Vehicle } from "@vandlabs/contracts";
import { money, number } from "../lib/format";
import { useShortlist } from "./shortlist";
import { ShareLink } from "./share-link";

export type CompareVehicle = Pick<Vehicle, "id" | "slug" | "make" | "model" | "variant" | "year" | "price" | "mileage" | "fuelType" | "transmission" | "ownership" | "condition" | "locationId" | "availabilityStatus" | "bodyType" | "features" | "media">;
export function CompareWorkspace({ vehicles, locations }: { vehicles: CompareVehicle[]; locations: Record<string, string> }) {
  const params = useSearchParams();
  const { ids: saved, setIds, ready } = useShortlist();
  const raw = params.get("ids");
  const [differences, setDifferences] = useState(false);
  const requested = raw === null ? saved : [...new Set(raw.slice(0, 1000).split(",").map(id => id.trim()).filter(id => vehicles.some(v => v.id === id)))].slice(0, 3);
  const selected = requested.map(id => vehicles.find(v => v.id === id)!).filter(Boolean);
  useEffect(() => {
    if (ready && raw !== null) setIds([...new Set(raw.slice(0, 1000).split(",").map(id => id.trim()).filter(id => vehicles.some(v => v.id === id)))].slice(0, 3));
  }, [raw, ready, vehicles, setIds]);
  function change(ids: string[]) {
    window.history.replaceState(null, "", "/compare?ids=" + ids.join(","));
    setIds(ids);
  }
  const rows: { label: string; value: (v: CompareVehicle) => string }[] = [
    { label: "Price", value: v => money(v.price) }, { label: "Year", value: v => String(v.year) },
    { label: "Mileage", value: v => `${number(v.mileage)} km` }, { label: "Body", value: v => v.bodyType },
    { label: "Fuel", value: v => v.fuelType }, { label: "Transmission", value: v => v.transmission },
    { label: "Ownership", value: v => v.ownership === 1 ? "First owner" : `${v.ownership} owners` },
    { label: "Condition", value: v => v.condition }, { label: "Location", value: v => locations[v.locationId] ?? "Dealership" },
    { label: "Availability", value: v => v.availabilityStatus },
  ];
  const visibleRows = differences ? rows.filter(row => new Set(selected.map(row.value)).size > 1) : rows;
  const priceGap = selected.length > 1 ? Math.max(...selected.map(v => v.price)) - Math.min(...selected.map(v => v.price)) : 0;
  return <>
    <div className="workspace-toolbar"><p className="subtle">{selected.length} of 3 spaces filled · saved on this browser</p><div className="toolbar-actions"><ShareLink path={`/compare?ids=${requested.join(",")}`} label="Share comparison" /><button className="text-button" type="button" onClick={() => change([])} disabled={!selected.length}>Clear comparison</button></div></div>
    <div className="compare-cards">{selected.map(v => <article className="compare-product" key={v.id}><div className="compare-photo">{v.media[0] && <Image src={v.media[0].url} alt={v.media[0].alt} fill sizes="(max-width: 700px) 100vw, 33vw" style={{ objectFit: "cover" }} unoptimized={!v.media[0].url.startsWith("https://images.unsplash.com/")} />}<button type="button" className="remove-car" aria-label={`Remove ${v.make} ${v.model}`} onClick={() => change(requested.filter(id => id !== v.id))}>×</button></div><div className="compare-product-copy"><span className="meta">{v.year} · {v.availabilityStatus}</span><h2>{v.make} {v.model}</h2><p>{v.variant}</p><strong>{money(v.price)}</strong><div className="actions"><Link className="rolling-link" href={`/vehicles/${v.slug}`}>Explore car ↗</Link><Link className="rolling-link" href={`/contact?vehicle=${v.id}&intent=test_drive`}>Test drive ↗</Link></div></div></article>)}{selected.length < 3 && <div className="compare-add"><span className="add-orbit" aria-hidden="true">+</span><h2>{selected.length ? "Room for one more." : "A good choice starts here."}</h2><p>Choose a car from the collection and see how the details line up.</p><label><span>Add a vehicle</span><select value="" onChange={e => { if (e.target.value) change([...requested, e.target.value]); }}><option value="">Choose a vehicle</option>{vehicles.filter(v => !requested.includes(v.id)).map(v => <option value={v.id} key={v.id}>{v.make} {v.model} · {money(v.price)}</option>)}</select></label><Link href="/inventory" className="rolling-link">Browse the collection ↗</Link></div>}</div>
    {selected.length > 0 && <>
      <div className="compare-insights" data-reveal><div><span>Price range</span><strong>{selected.length > 1 ? `${money(Math.min(...selected.map(v => v.price)))} — ${money(Math.max(...selected.map(v => v.price)))}` : money(selected[0].price)}</strong></div><div><span>Difference in asking price</span><strong>{selected.length > 1 ? money(priceGap) : "Add a second car"}</strong></div><div><span>Your next step</span><Link href={`/contact?ids=${requested.join(",")}`}>Talk through these cars ↗</Link></div></div>
      <div className="comparison-heading"><div><p className="eyebrow">The details, side by side</p><h2>Small differences.<br />A clearer decision.</h2></div><label className="check-row"><input type="checkbox" checked={differences} onChange={e => setDifferences(e.target.checked)} /><span>Show differences only</span></label></div>
      <div className="compare-wrap"><table className="compare-table"><caption className="sr-only">Selected vehicle specifications</caption><thead><tr><th scope="col">Attribute</th>{selected.map(v => <th scope="col" key={v.id}><Link href={`/vehicles/${v.slug}`}>{v.make} {v.model}</Link><small>{v.variant}</small></th>)}</tr></thead><tbody>{visibleRows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{selected.map(v => <td key={v.id}>{row.value(v)}</td>)}</tr>)}</tbody></table></div>
      {!visibleRows.length && <p role="status" className="subtle">These selected cars share the same listed attributes. Turn off differences only to see all details.</p>}
      <div className="compare-features" data-reveal>{selected.map(v => <article key={v.id}><p className="eyebrow">{v.make} {v.model}</p><h3>Standout details.</h3><ul>{v.features.slice(0, 5).map(f => <li key={f}>{f}</li>)}</ul></article>)}</div>
    </>}
    <section className="discovery-note" data-reveal><div><p className="eyebrow">From shortlist to showroom</p><h2>The next step is personal.</h2><p>Bring the cars you like into a conversation. Ask questions, discuss an exchange, or request a visit.</p></div><Link className="button primary" href={requested.length ? `/contact?ids=${requested.join(",")}` : "/contact"}>Talk through the shortlist ↗</Link><Link className="button" href="/inventory">Change selection</Link></section>
  </>;
}
