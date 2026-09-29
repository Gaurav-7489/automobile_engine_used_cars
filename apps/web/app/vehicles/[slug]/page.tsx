import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dealershipService } from "../../../lib/services";
import { locationName } from "../../../lib/config";
import { money, number } from "../../../lib/format";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const vehicles = await dealershipService.inventory();
  return vehicles.map((vehicle) => ({ slug: vehicle.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const vehicle = await dealershipService.vehicle(slug);
  if (!vehicle) return { title: "Vehicle unavailable" };
  return {
    title: `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.variant}`,
    description: `${number(vehicle.mileage)} km · ${vehicle.fuelType} · ${money(vehicle.price)}`,
    alternates: { canonical: `/vehicles/${vehicle.slug}` },
    openGraph: {
      title: `${vehicle.make} ${vehicle.model} ${vehicle.variant}`,
      description: `${vehicle.year} · ${number(vehicle.mileage)} km · ${money(vehicle.price)}`,
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const vehicle = await dealershipService.vehicle(slug);
  if (!vehicle) notFound();

  return (
    <main className="shell section">
      <Link href="/inventory">← Inventory</Link>
      <div className="vehicle-hero">
        <div className="vehicle-media media-placeholder">
          {vehicle.media.length ? "Vehicle media" : `${vehicle.make} ${vehicle.model}`}
        </div>
        <div>
          <p className="eyebrow">{vehicle.stockId} · {vehicle.availabilityStatus}</p>
          <h1 className="page-title">{vehicle.make} {vehicle.model}</h1>
          <p className="lede">{vehicle.variant}</p>
          <strong className="vehicle-price">{money(vehicle.price)}</strong>
          <dl className="spec-grid">
            <div><dt>Year</dt><dd>{vehicle.year}</dd></div>
            <div><dt>Mileage</dt><dd>{number(vehicle.mileage)} km</dd></div>
            <div><dt>Fuel</dt><dd>{vehicle.fuelType}</dd></div>
            <div><dt>Transmission</dt><dd>{vehicle.transmission}</dd></div>
            <div><dt>Ownership</dt><dd>{vehicle.ownership}</dd></div>
            <div><dt>Location</dt><dd>{locationName(vehicle.locationId)}</dd></div>
          </dl>
          <div className="actions">
            <a className="button primary" href="https://wa.me/919000000000">WhatsApp</a>
            <a className="button" href="tel:+914845550140">Call</a>
            <Link className="button" href="/contact">Enquire</Link>
            <Link className="button" href="/contact">Test drive</Link>
          </div>
        </div>
      </div>
      <section className="detail-grid">
        <div>
          <h2>Key specifications</h2>
          {Object.entries(vehicle.specifications).map(([key, value]) => (
            <p key={key}><strong>{key}</strong> · {value}</p>
          ))}
        </div>
        <div>
          <h2>Features</h2>
          <ul>{vehicle.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
          <p>Finance: {vehicle.financeEligible ? "Eligible" : "Not available"} · Exchange: {vehicle.exchangeEligible ? "Eligible" : "Not available"}</p>
        </div>
      </section>
    </main>
  );
}
