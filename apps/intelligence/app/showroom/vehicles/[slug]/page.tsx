import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CarImage } from "@/components/showroom/car-image";
import { km, money, sampleLocation, sampleVehicle } from "@/lib/showroom";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const v = sampleVehicle((await params).slug);
  return { title: v ? `${v.year} ${v.make} ${v.model}` : "Vehicle" };
}

export default async function VehiclePage({ params }: { params: Params }) {
  const v = sampleVehicle((await params).slug);
  if (!v) notFound();
  const facts: [string, string][] = [
    ["Year", String(v.year)], ["Kilometres", km(v.mileage)], ["Fuel", v.fuelType], ["Transmission", v.transmission],
    ["Owners", String(v.ownership)], ["Body", v.bodyType], ["Condition", v.condition], ["Colour", `${v.exteriorColor} / ${v.interiorColor}`],
    ["Location", sampleLocation(v.locationId)], ...Object.entries(v.specifications).map(([k, val]) => [k, String(val)] as [string, string]),
  ];
  const image = v.media[0];
  return (
    <article className="sr-section sr-detail">
      <p><Link href="/showroom/inventory" className="link-btn">Back to inventory</Link></p>
      <div className="sr-detail-grid">
        <div className="sr-detail-media">
          <CarImage src={image?.url} alt={`${v.make} ${v.model}`} />
        </div>
        <div>
          <span className={`sr-badge sr-${v.availabilityStatus}`}>{v.availabilityStatus}</span>
          <h1>{v.year} {v.make} {v.model}</h1>
          <p className="meta">{v.variant}</p>
          <p className="sr-price">{money(v.price)}</p>
          <p className="meta">Enquiries are handled by the dealership team. This sample catalogue does not take requests.</p>
          <Link href="/login" className="btn btn-primary">Dealer sign in</Link>
        </div>
      </div>
      <h2>Specification</h2>
      <dl className="sr-facts">{facts.map(([k, val]) => <div key={k}><dt>{k}</dt><dd>{val}</dd></div>)}</dl>
      <h2>Features</h2>
      <ul className="sr-features">{v.features.map(f => <li key={f}>{f}</li>)}</ul>
    </article>
  );
}
