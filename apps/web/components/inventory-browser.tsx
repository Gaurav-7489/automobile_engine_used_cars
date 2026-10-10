"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Vehicle } from "@vandlabs/contracts";
import { VehicleCard } from "./vehicle-card";
import { useShortlist } from "./shortlist";
import { ShareLink } from "./share-link";

export function InventoryBrowser({ vehicles, locationNames }: { vehicles: Vehicle[]; locationNames: Record<string, string> }) {
  const params = useSearchParams();
  const { ids } = useShortlist();
  const query = (params.get("q") ?? "").slice(0, 120);
  const body = params.get("body") ?? "all", fuel = params.get("fuel") ?? "all", make = params.get("make") ?? "all", location = params.get("location") ?? "all";
  const budget = params.get("budget") ?? "all", sort = params.get("sort") ?? "recommended", view = params.get("view") === "list" ? "list" : "grid";
  const savedOnly = params.get("shortlist") === "1", availableOnly = params.get("available") === "1", firstOwner = params.get("owner") === "1";
  const bodies = [...new Set(vehicles.map(v => v.bodyType))];
  const fuels = [...new Set(vehicles.map(v => v.fuelType))];
  const makes = [...new Set(vehicles.map(v => v.make))].sort();
  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "all" || value === "recommended" || (key === "view" && value === "grid")) next.delete(key); else next.set(key, value);
    window.history.replaceState(null, "", "/inventory" + (next.size ? "?" + next : ""));
  }
  function reset() { window.history.replaceState(null, "", "/inventory"); }
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const maxPrice = Number(budget);
    return vehicles.filter(v => (!normalized || [v.make, v.model, v.variant, v.bodyType, v.fuelType, v.transmission].join(" ").toLowerCase().includes(normalized)) && (body === "all" || v.bodyType === body) && (fuel === "all" || v.fuelType === fuel) && (make === "all" || v.make === make) && (location === "all" || v.locationId === location) && (budget === "all" || (Number.isFinite(maxPrice) && maxPrice > 0 && v.price <= maxPrice)) && (!availableOnly || v.availabilityStatus === "available") && (!firstOwner || v.ownership === 1) && (!savedOnly || ids.includes(v.id))).sort((a, b) => {
      if (sort === "price-low") return a.price - b.price;
      if (sort === "price-high") return b.price - a.price;
      if (sort === "mileage") return a.mileage - b.mileage;
      if (sort === "newest") return b.year - a.year;
      return Number(a.availabilityStatus !== "available") - Number(b.availabilityStatus !== "available");
    });
  }, [vehicles, query, body, fuel, make, location, budget, sort, availableOnly, firstOwner, savedOnly, ids]);
  const active = [["q", query], ["body", body], ["fuel", fuel], ["make", make], ["location", location], ["budget", budget]].filter(([, value]) => value && value !== "all");

  return <>
    <div className="collection-tabs" aria-label="Quick collections"><button type="button" aria-pressed={body === "all"} onClick={() => update("body", "all")}>All cars</button>{bodies.map(item => <button type="button" key={item} aria-pressed={body === item} onClick={() => update("body", item)}>{item}</button>)}<button type="button" aria-pressed={firstOwner} onClick={() => update("owner", firstOwner ? "" : "1")}>First owner</button><button type="button" aria-pressed={savedOnly} onClick={() => update("shortlist", savedOnly ? "" : "1")}>My shortlist ({ids.length})</button></div>
    <div className="inventory-toolbar" aria-label="Inventory filters">
      <label className="filter-wide"><span>Search the collection</span><input value={query} onChange={e => update("q", e.target.value)} placeholder="BMW, SUV, automatic..." /></label>
      <label><span>Body</span><select value={body} onChange={e => update("body", e.target.value)}><option value="all">All body types</option>{bodies.map(item => <option key={item}>{item}</option>)}</select></label>
      <label><span>Fuel</span><select value={fuel} onChange={e => update("fuel", e.target.value)}><option value="all">All fuel types</option>{fuels.map(item => <option key={item}>{item}</option>)}</select></label>
      <label><span>Make</span><select value={make} onChange={e => update("make", e.target.value)}><option value="all">All makes</option>{makes.map(item => <option key={item}>{item}</option>)}</select></label>
      <label><span>Budget</span><select value={budget} onChange={e => update("budget", e.target.value)}><option value="all">Any budget</option>{[1500000,2500000,5000000,7500000].map(value => <option value={value} key={value}>Up to ₹{value / 100000} lakh</option>)}</select></label>
      <label><span>Studio</span><select value={location} onChange={e => update("location", e.target.value)}><option value="all">Every studio</option>{Object.entries(locationNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label><span>Sort</span><select value={sort} onChange={e => update("sort", e.target.value)}><option value="recommended">Recommended</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="mileage">Lowest mileage</option><option value="newest">Newest year</option></select></label>
      <label className="check-row filter-check"><input type="checkbox" checked={availableOnly} onChange={e => update("available", e.target.checked ? "1" : "")} /><span>Available only</span></label>
    </div>
    {active.length > 0 && <div className="filter-chips" aria-label="Active filters">{active.map(([key, value]) => <button type="button" key={key} aria-label={`Remove ${key} filter`} onClick={() => update(key, "")}>{key === "location" ? locationNames[value] ?? value : key === "budget" ? `Up to ₹${Number(value) / 100000}L` : value} <span aria-hidden="true">×</span></button>)}<button type="button" className="text-button" onClick={reset}>Reset all</button></div>}
    <div className="inventory-summary"><span role="status">{filtered.length} matching vehicles</span><div className="inventory-view-actions"><div className="segmented-control" aria-label="Inventory view"><button type="button" aria-pressed={view === "grid"} onClick={() => update("view", "grid")}>Grid</button><button type="button" aria-pressed={view === "list"} onClick={() => update("view", "list")}>List</button></div><ShareLink label="Share search" /></div></div>
    {filtered.length ? <div className={`inventory-grid ${view === "list" ? "inventory-list" : ""}`}>{filtered.map(v => <VehicleCard key={v.id} vehicle={v} locationLabel={locationNames[v.locationId]} />)}</div> : <section className="empty-state" role="status"><p className="eyebrow">A little more room</p><h2>{savedOnly ? "Your shortlist starts here." : "Try a wider search."}</h2><p>{savedOnly ? "Add cars from the collection, then compare the ones you like." : "No cars match these filters. Adjust a detail or explore the full collection."}</p><button type="button" className="button primary" onClick={reset}>Explore all vehicles</button></section>}
    <section className="discovery-note" data-reveal><div><p className="eyebrow">A little help choosing</p><h2>Find your kind of drive.</h2><p>Save up to three cars, compare the details, then take your shortlist into a conversation.</p></div><Link className="button primary" href={ids.length ? `/compare?ids=${ids.join(",")}` : "/compare"}>Open comparison <span aria-hidden="true">↗</span></Link><Link className="button" href="/contact">Help me choose</Link></section>
  </>;
}
