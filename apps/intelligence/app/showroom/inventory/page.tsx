import Link from "next/link";
import type { Metadata } from "next";
import { ShowroomGrid } from "@/components/showroom/vehicle-card";
import { filterVehicles, sampleVehicles } from "@/lib/showroom";

export const metadata: Metadata = { title: "Inventory" };

type Search = Promise<{ q?: string; body?: string; fuel?: string; sort?: string }>;
const SORTS = [{ value: "", label: "Featured" }, { value: "price-asc", label: "Price, low to high" }, { value: "price-desc", label: "Price, high to low" }, { value: "km-asc", label: "Lowest kilometres" }, { value: "newest", label: "Newest" }];

/** Laid out like a dealership's own page (/l/{tenant}), over the labelled sample catalogue. */
export default async function Inventory({ searchParams }: { searchParams: Search }) {
  const query = await searchParams;
  const all = sampleVehicles();
  const bodies = [...new Set(all.map((v) => v.bodyType))].sort();
  const fuels = [...new Set(all.map((v) => v.fuelType))].sort();
  const list = filterVehicles(all, query);
  const filtered = Boolean(query.q || query.body || query.fuel);
  return (
    <section className="sr-section">
      <h1 className="pl-inv-title">Cars for sale</h1>
      <p className="muted" role="status">{list.length} sample car{list.length === 1 ? "" : "s"} {filtered ? "match your search" : "available"}</p>
      <form className="pl-filters" method="get" action="/showroom/inventory" role="search" aria-label="Filter inventory">
        <label className="pl-filter pl-filter-q"><span className="label">Search</span><input className="input" type="search" name="q" defaultValue={query.q ?? ""} placeholder="Make, model, year" maxLength={60} /></label>
        <label className="pl-filter"><span className="label pl-filter-label">Body</span><select className="input" name="body" defaultValue={query.body ?? ""}><option value="">Any body</option>{bodies.map((b) => <option key={b} value={b}>{b}</option>)}</select></label>
        <label className="pl-filter"><span className="label pl-filter-label">Fuel</span><select className="input" name="fuel" defaultValue={query.fuel ?? ""}><option value="">Any fuel</option>{fuels.map((f) => <option key={f} value={f}>{f}</option>)}</select></label>
        <label className="pl-filter"><span className="label pl-filter-label">Sort</span><select className="input" name="sort" defaultValue={query.sort ?? ""}>{SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
        <div className="pl-filter-actions"><button className="btn btn-primary" type="submit">Show cars</button>{filtered || query.sort ? <Link className="btn" href="/showroom/inventory">Clear</Link> : null}</div>
      </form>
      {list.length ? <ShowroomGrid vehicles={list} /> : <div className="pl-missing"><h2>No cars match</h2><p className="muted">Try fewer filters.</p></div>}
    </section>
  );
}
