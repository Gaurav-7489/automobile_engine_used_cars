import Link from "next/link";
import { dealershipService } from "../lib/services";
import { number } from "../lib/format";
import { dealershipJsonLd } from "../lib/seo";
import { VehicleCard } from "../components/vehicle-card";

export default async function Page() {
  const { tenant, featured, snapshot } = await dealershipService.home();
  const dealer = tenant.organization.dealerships.find(
    (item) => item.id === tenant.activeDealershipId,
  )!;

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(dealershipJsonLd(tenant)),
        }}
      />

      <section className="shell hero">
        <div className="hero-copy">
          <p className="eyebrow">
            {dealer.name} · {dealer.locations.map((item) => item.city).join(" / ")}
          </p>
          <h1>Cars worth arriving in.</h1>
          <p className="lede">
            Verified premium pre-owned inventory, presented with the context you
            actually need to decide.
          </p>
          <div className="actions">
            <Link className="button primary" href="/inventory">
              Explore {snapshot.available} available cars
            </Link>
            <Link className="button" href="/contact">
              Speak to a specialist
            </Link>
          </div>
        </div>
        <div className="hero-facts" aria-label="Dealership facts">
          <div>
            <strong>{snapshot.inventory}</strong>
            <span>published vehicles</span>
          </div>
          <div>
            <strong>2</strong>
            <span>studio locations</span>
          </div>
          <div>
            <strong>{number(100)}%</strong>
            <span>vehicle context preserved</span>
          </div>
        </div>
      </section>

      <section className="shell section">
        <div className="sectionhead">
          <div>
            <p className="eyebrow">Featured inventory</p>
            <h2>Recently selected.</h2>
          </div>
          <Link href="/inventory">View all vehicles →</Link>
        </div>
        <div className="inventory-grid">
          {featured.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} />
          ))}
        </div>
      </section>

      <section className="shell section split-section">
        <div>
          <p className="eyebrow">No pressure, more signal</p>
          <h2>Discovery built around the vehicle.</h2>
        </div>
        <div className="feature-stack">
          <article>
            <span>01</span>
            <div>
              <h3>Verified inventory facts</h3>
              <p>
                Price, mileage, condition, availability and specifications come
                from the canonical vehicle record.
              </p>
            </div>
          </article>
          <article>
            <span>02</span>
            <div>
              <h3>Compare without losing context</h3>
              <p>
                Shortlist up to three cars and review the commercial and technical
                differences side by side.
              </p>
            </div>
          </article>
          <article>
            <span>03</span>
            <div>
              <h3>One step to a human</h3>
              <p>
                WhatsApp, call, enquiry, finance, exchange and test-drive intent
                all preserve the vehicle that started the conversation.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="dark-band">
        <div className="shell band-grid">
          <div>
            <p className="eyebrow light">Powered by VandLabs Automobile Engine</p>
            <h2>The website is the front door, not the whole building.</h2>
          </div>
          <p>
            Every permitted source, campaign and vehicle interaction can flow
            into a structured lead, sales follow-up and trustworthy reporting
            without forcing a customer account.
          </p>
        </div>
      </section>
    </main>
  );
}
