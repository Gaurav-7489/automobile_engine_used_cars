import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dealershipService } from "../../../lib/services";
import { locationName, tenantConfig } from "../../../lib/config";
import { money, number } from "../../../lib/format";
import { vehicleJsonLd, serializeJsonLd } from "../../../lib/seo";
import { LeadForm } from "../../../components/lead-form";
import { TrackedAction } from "../../../components/tracked-action";
import { VehicleGallery } from "../../../components/vehicle-gallery";
import { ShortlistButton } from "../../../components/shortlist";
import { ShareLink } from "../../../components/share-link";
import { VehicleCard } from "../../../components/vehicle-card";
import { VehicleViewEvent } from "../../../components/vehicle-view-event";

type PageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

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
  const [vehicle, inventory] = await Promise.all([dealershipService.vehicle(slug), dealershipService.inventory()]);
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
  const related = inventory.filter(v => v.id !== vehicle.id && v.availabilityStatus === "available").sort((a, b) => Number(b.bodyType === vehicle.bodyType) - Number(a.bodyType === vehicle.bodyType)).slice(0, 3);

  return (
    <main>
      <VehicleViewEvent vehicleId={vehicle.id} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(vehicleJsonLd(vehicle, tenantConfig)),
        }}
      />

      <section className="shell section">
        <Link href="/inventory">← Inventory</Link>
        <div className="vehicle-hero">
          <div><VehicleGallery media={vehicle.media} label={label} availability={vehicle.availabilityStatus} />{process.env.DATA_MODE !== "aurora" && <p className="meta gallery-disclosure">Editorial demonstration photography. Confirm actual vehicle photos with the dealership.</p>}</div>
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
                <dd>
                  {vehicle.ownership === 1
                    ? "First owner"
                    : vehicle.ownership + " owners"}
                </dd>
              </div>
              <div>
                <dt>Condition</dt>
                <dd>{vehicle.condition}</dd>
              </div>
            </dl>
            <div className="vehicle-quick-actions"><ShortlistButton id={vehicle.id} /><ShareLink path={`/vehicles/${vehicle.slug}`} label="Share car" /></div>
            <div className="actions">
              <TrackedAction
                className="button primary"
                href={whatsapp}
                eventType="whatsapp_click"
                vehicleId={vehicle.id}
              >
                WhatsApp about this car
              </TrackedAction>
              <TrackedAction
                className="button"
                href={"tel:" + tenantConfig.contact.phone}
                eventType="call_click"
                vehicleId={vehicle.id}
              >
                Call studio
              </TrackedAction>
              <Link className="button primary" href={`/contact?vehicle=${vehicle.id}&intent=test_drive`}>Request a test drive ↗</Link>
              <a className="button" href="#enquire">
                Enquire / test drive
              </a>
            </div>
          </div>
        </div>

        <nav className="vehicle-section-nav" aria-label="Vehicle details"><a href="#specifications">Specifications</a><a href="#features">Features</a><a href="#enquire">Enquiry</a><Link href={`/compare?ids=${vehicle.id}`}>Compare this car ↗</Link></nav>
        <section className="detail-grid" data-reveal>
          <div id="specifications">
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
          <div id="features">
            <p className="eyebrow">Included context</p>
            <h2>Features</h2>
            <ul className="feature-list">
              {vehicle.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <p className="subtle">
              Finance:{" "}
              {vehicle.financeEligible
                ? "Eligible for discussion"
                : "Not available"}{" "}
              · Exchange:{" "}
              {vehicle.exchangeEligible
                ? "Eligible for discussion"
                : "Not available"}
            </p>
            <div className="actions">{vehicle.financeEligible && <Link className="rolling-link" href={`/contact?vehicle=${vehicle.id}&intent=finance`}>Discuss finance ↗</Link>}{vehicle.exchangeEligible && <Link className="rolling-link" href={`/contact?vehicle=${vehicle.id}&intent=exchange`}>Discuss an exchange ↗</Link>}</div>
          </div>
        </section>
      </section>

      <section className="dark-band" id="enquire">
        <div className="shell conversion-layout">
          <div>
            <p className="eyebrow light">Keep the vehicle context</p>
            <h2>Move from interest to a real conversation.</h2>
            <p>
              Request a test drive, discuss finance or share an exchange
              interest. The request is tied to {vehicle.make} {vehicle.model};
              no customer account is required.
            </p>
          </div>
          <div className="form-panel dark-form">
            <LeadForm vehicleId={vehicle.id} vehicleLabel={label} />
          </div>
        </div>
      </section>
      {related.length > 0 && <section className="shell section" data-reveal><div className="sectionhead"><div><p className="eyebrow">Keep exploring</p><h2>More possibilities.</h2></div><Link href="/inventory" className="rolling-link">View all cars ↗</Link></div><div className="inventory-grid">{related.map(v => <VehicleCard key={v.id} vehicle={v} locationLabel={locationName(v.locationId)} />)}</div></section>}
    </main>
  );
}
