import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dealershipService } from "../../../lib/services";
import { locationName, tenantConfig } from "../../../lib/config";
import { money, number } from "../../../lib/format";
import { vehicleJsonLd } from "../../../lib/seo";
import { LeadForm } from "../../../components/lead-form";
import { VehicleViewEvent } from "../../../components/vehicle-view-event";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const vehicles = await dealershipService.inventory();
  return vehicles.map((vehicle) => ({ slug: vehicle.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const vehicle = await dealershipService.vehicle(slug);
  if (!vehicle) return { title: "Vehicle unavailable" };

  return {
    title:
      vehicle.year +
      " " +
      vehicle.make +
      " " +
      vehicle.model +
      " " +
      vehicle.variant,
    description:
      number(vehicle.mileage) +
      " km · " +
      vehicle.fuelType +
      " · " +
      money(vehicle.price),
    alternates: { canonical: "/vehicles/" + vehicle.slug },
    openGraph: {
      title: vehicle.make + " " + vehicle.model + " " + vehicle.variant,
      description:
        vehicle.year +
        " · " +
        number(vehicle.mileage) +
        " km · " +
        money(vehicle.price),
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const vehicle = await dealershipService.vehicle(slug);
  if (!vehicle) notFound();

  const label =
    vehicle.year +
    " " +
    vehicle.make +
    " " +
    vehicle.model +
    " " +
    vehicle.variant;
  const whatsappText = encodeURIComponent(
    "Hi Apex Select, I am interested in " +
      label +
      " (" +
      vehicle.stockId +
      "). Is it available?",
  );
  const whatsapp =
    "https://wa.me/" +
    tenantConfig.contact.whatsapp.replace(/[^0-9]/g, "") +
    "?text=" +
    whatsappText;
  const image = vehicle.media[0];

  return (
    <main>
      <VehicleViewEvent vehicleId={vehicle.id} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(vehicleJsonLd(vehicle, tenantConfig)),
        }}
      />

      <section className="shell section">
        <Link href="/inventory">← Inventory</Link>
        <div className="vehicle-hero">
          <div
            className="vehicle-media-hero"
            role="img"
            aria-label={image?.alt ?? label}
            style={image ? { backgroundImage: "url(" + image.url + ")" } : undefined}
          >
            <span className={"availability " + vehicle.availabilityStatus}>
              {vehicle.availabilityStatus}
            </span>
          </div>
          <div className="vehicle-summary">
            <p className="eyebrow">
              {vehicle.stockId} · {locationName(vehicle.locationId)}
            </p>
            <h1 className="page-title">
              {vehicle.make} {vehicle.model}
            </h1>
            <p className="lede">{vehicle.variant}</p>
            <strong className="vehicle-price">{money(vehicle.price)}</strong>
            <dl className="spec-grid">
              <div>
                <dt>Year</dt>
                <dd>{vehicle.year}</dd>
              </div>
              <div>
                <dt>Mileage</dt>
                <dd>{number(vehicle.mileage)} km</dd>
              </div>
              <div>
                <dt>Fuel</dt>
                <dd>{vehicle.fuelType}</dd>
              </div>
              <div>
                <dt>Transmission</dt>
                <dd>{vehicle.transmission}</dd>
              </div>
              <div>
                <dt>Ownership</dt>
                <dd>{vehicle.ownership === 1 ? "First owner" : vehicle.ownership}</dd>
              </div>
              <div>
                <dt>Condition</dt>
                <dd>{vehicle.condition}</dd>
              </div>
            </dl>
            <div className="actions">
              <a className="button primary" href={whatsapp}>
                WhatsApp about this car
              </a>
              <a className="button" href={"tel:" + tenantConfig.contact.phone}>
                Call studio
              </a>
              <a className="button" href="#enquire">
                Enquire / test drive
              </a>
            </div>
          </div>
        </div>

        <section className="detail-grid">
          <div>
            <p className="eyebrow">Vehicle facts</p>
            <h2>Key specifications</h2>
            <dl className="detail-list">
              {Object.entries(vehicle.specifications).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
              <div>
                <dt>Exterior</dt>
                <dd>{vehicle.exteriorColor}</dd>
              </div>
              <div>
                <dt>Interior</dt>
                <dd>{vehicle.interiorColor}</dd>
              </div>
            </dl>
          </div>
          <div>
            <p className="eyebrow">Included context</p>
            <h2>Features</h2>
            <ul className="feature-list">
              {vehicle.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <p className="subtle">
              Finance: {vehicle.financeEligible ? "Eligible for discussion" : "Not available"} ·
              Exchange: {vehicle.exchangeEligible ? "Eligible for discussion" : "Not available"}
            </p>
          </div>
        </section>
      </section>

      <section className="dark-band" id="enquire">
        <div className="shell conversion-layout">
          <div>
            <p className="eyebrow light">Keep the vehicle context</p>
            <h2>Move from interest to a real conversation.</h2>
            <p>
              Request a test drive, discuss finance or share an exchange interest.
              The request is tied to {vehicle.make} {vehicle.model}; no customer
              account is required.
            </p>
          </div>
          <div className="form-panel dark-form">
            <LeadForm vehicleId={vehicle.id} vehicleLabel={label} />
          </div>
        </div>
      </section>
    </main>
  );
}
