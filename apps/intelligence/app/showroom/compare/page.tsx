import Link from "next/link";
import type { Metadata } from "next";
import { km, money, sampleLocation, sampleVehicle } from "@/lib/showroom";
import type { Vehicle } from "@vandlabs/contracts";

export const metadata: Metadata = { title: "Compare" };

const rows: [string, (v: Vehicle) => string][] = [
  ["Price", v => money(v.price)], ["Year", v => String(v.year)], ["Kilometres", v => km(v.mileage)], ["Fuel", v => v.fuelType],
  ["Transmission", v => v.transmission], ["Owners", v => String(v.ownership)], ["Body", v => v.bodyType], ["Condition", v => v.condition],
  ["Colour", v => v.exteriorColor], ["Location", v => sampleLocation(v.locationId)], ["Seats", v => String(v.specifications.seats ?? "Not recorded")],
];

export default async function Compare({ searchParams }: { searchParams: Promise<{ cars?: string }> }) {
  const { cars = "" } = await searchParams;
  const list = [...new Set(cars.split(",").filter(Boolean))].slice(0, 3).map(sampleVehicle).filter((v): v is Vehicle => Boolean(v));
  if (list.length < 2) return <section className="sr-section"><h1>Compare</h1><p>Pick at least two cars from <Link href="/showroom/saved" className="link-btn">Saved cars</Link> to compare them.</p></section>;
  return (
    <section className="sr-section">
      <h1>Compare</h1>
      <div className="sr-table-wrap" role="region" aria-label="Comparison table" tabIndex={0}>
        <table className="sr-table">
          <thead><tr><th scope="col">Specification</th>{list.map(v => <th scope="col" key={v.id}><Link href={`/showroom/vehicles/${v.slug}`}>{v.year} {v.make} {v.model}</Link></th>)}</tr></thead>
          <tbody>{rows.map(([label, get]) => <tr key={label}><th scope="row">{label}</th>{list.map(v => <td key={v.id}>{get(v)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
