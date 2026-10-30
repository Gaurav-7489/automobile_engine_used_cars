import type { Metadata } from "next";
import { ShowroomCard } from "@/components/showroom/vehicle-card";
import { filterVehicles, sampleVehicles } from "@/lib/showroom";

export const metadata: Metadata = { title: "Inventory" };

type Search = Promise<{ q?: string; body?: string; fuel?: string; sort?: string }>;

export default async function Inventory({ searchParams }: { searchParams: Search }) {
  const query = await searchParams;
  const all = sampleVehicles();
  const bodies = [...new Set(all.map(v => v.bodyType))].sort();
  const fuels = [...new Set(all.map(v => v.fuelType))].sort();
  const list = filterVehicles(all, query);
  return (
    <section className="sr-section">
      <h1>Inventory</h1>
      <form className="sr-filters" role="search" aria-label="Filter inventory">
        <label>Search<input name="q" type="search" defaultValue={query.q ?? ""} placeholder="Make, model, year" /></label>
        <label>Body<select name="body" defaultValue={query.body ?? ""}><option value="">Any</option>{bodies.map(b => <option key={b}>{b}</option>)}</select></label>
        <label>Fuel<select name="fuel" defaultValue={query.fuel ?? ""}><option value="">Any</option>{fuels.map(f => <option key={f}>{f}</option>)}</select></label>
        <label>Sort<select name="sort" defaultValue={query.sort ?? ""}><option value="">Featured</option><option value="price-asc">Price, low to high</option><option value="price-desc">Price, high to low</option><option value="km-asc">Lowest kilometres</option><option value="newest">Newest</option></select></label>
        <button className="btn btn-primary" type="submit">Apply</button>
      </form>
      <p className="meta" role="status">{list.length} {list.length === 1 ? "car" : "cars"}</p>
      {list.length ? <div className="sr-grid">{list.map(v => <ShowroomCard key={v.id} vehicle={v} />)}</div> : <p>No cars match those filters.</p>}
    </section>
  );
}
