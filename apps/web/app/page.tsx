import Link from "next/link";
import { dealershipService } from "../lib/services";
import { ShowroomHero } from "../components/showroom-hero";
import { SpotlightCard } from "../components/spotlight-card";
import { dealershipJsonLd, serializeJsonLd } from "../lib/seo";
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
          __html: serializeJsonLd(dealershipJsonLd(tenant)),
        }}
      />

      <ShowroomHero vehicle={featured[0]} dealer={dealer.name} cities={dealer.locations.map(item => item.city).join(" / ")} available={snapshot.available} locations={dealer.locations.length} />

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
            <VehicleCard key={vehicle.id} vehicle={vehicle} locationLabel={tenant.organization.dealerships.flatMap(d=>d.locations).find(l=>l.id===vehicle.locationId)?.name} />
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

      <section className="ecosystem-band">
        <div className="shell">
          <div className="sectionhead"><div><p className="eyebrow light">VandLabs Automobile Engine</p><h2>One engine.<br />Every opportunity.</h2></div><p className="subtle">From the first vehicle view to the next sale.<br />A connected workspace for your dealership.</p></div>
          <div className="ecosystem-grid">
            <SpotlightCard><span className="feature-number">01 / DISCOVERY</span><h3>A showroom that works for you.</h3><p>Inventory, vehicle details, comparison and enquiry. Every conversation starts with context.</p><Link href="/inventory">Explore the collection ↗</Link></SpotlightCard>
            <SpotlightCard><span className="feature-number">02 / OPERATIONS</span><h3>Your dealership, within reach.</h3><p>Leads, follow-ups, appointments and stock operations in the Windows and macOS workspace.</p><Link href="/download">Get the desktop app ↗</Link></SpotlightCard>
            <SpotlightCard><span className="feature-number">03 / CONNECTION</span><h3>Keep the human in the loop.</h3><p>Speak with a specialist about your next car, an exchange or a confirmed showroom visit.</p><Link href="/contact">Start a conversation ↗</Link></SpotlightCard>
          </div>
        </div>
      </section>
    </main>
  );
}
