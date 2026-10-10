import Link from "next/link";
import { dealershipService } from "../lib/services";
import { ShowroomHero } from "../components/showroom-hero";
import { SpotlightCard } from "../components/spotlight-card";
import { dealershipJsonLd, serializeJsonLd } from "../lib/seo";
import { VehicleCard } from "../components/vehicle-card";
import { RollingLink } from "../components/rolling-link";

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

      <ShowroomHero vehicles={featured.slice(0, 3).map(({ id, slug, make, model, year, variant, price, media }) => ({ id, slug, make, model, year, variant, price, media: media.slice(0, 1) }))} dealer={dealer.name} cities={dealer.locations.map(item => item.city).join(" / ")} available={snapshot.available} locations={dealer.locations.length} />

      <section className="collection-section"><div className="shell section">
        <div className="sectionhead">
          <div>
            <p className="eyebrow">Featured inventory</p>
            <h2>Recently selected.</h2>
          </div>
          <RollingLink href="/inventory">View all vehicles</RollingLink>
        </div>
        <div className="inventory-grid">
          {featured.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} locationLabel={tenant.organization.dealerships.flatMap(d=>d.locations).find(l=>l.id===vehicle.locationId)?.name} />
          ))}
        </div>
      </div></section>

      <section className="discovery-section"><div className="shell section split-section">
        <div>
          <span className="discovery-flower" aria-hidden="true">✳</span>
          <p className="eyebrow">No pressure, more signal</p>
          <h2>Less guesswork.<br />More <span>good feeling.</span></h2>
          <p className="discovery-intro">From the first look to the next conversation, make room for the drive that fits your life.</p>
          <RollingLink href="/compare">Find your favourite</RollingLink>
        </div>
        <div className="feature-stack">
          <article>
            <span>01</span>
            <div>
              <h3>Verified inventory facts</h3>
              <p>
                The price, mileage, specifications and availability — the details
                you need, together in one clear view.
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
      </div></section>

      <section className="ecosystem-band">
        <div className="shell">
          <div className="sectionhead"><div><p className="eyebrow light">VandLabs Automobile Engine</p><h2>One engine.<br />Every opportunity.</h2></div><p className="subtle">From the first vehicle view to the next sale.<br />A connected workspace for your dealership.</p></div>
          <div className="ecosystem-grid">
            <SpotlightCard><span className="feature-number">01 / DISCOVERY</span><span className="feature-symbol" aria-hidden="true">↗</span><h3>A showroom that works for you.</h3><p>Inventory, vehicle details, comparison and enquiry. Every conversation starts with context.</p><RollingLink href="/inventory">Explore the collection</RollingLink></SpotlightCard>
            <SpotlightCard><span className="feature-number">02 / OPERATIONS</span><span className="feature-symbol" aria-hidden="true">⌘</span><h3>Your dealership, within reach.</h3><p>Leads, follow-ups, appointments and stock operations in the Windows and macOS workspace.</p><RollingLink href="/download">Get the desktop app</RollingLink></SpotlightCard>
            <SpotlightCard><span className="feature-number">03 / CONNECTION</span><span className="feature-symbol" aria-hidden="true">✳</span><h3>Keep the human in the loop.</h3><p>Speak with a specialist about your next car, an exchange or a confirmed showroom visit.</p><RollingLink href="/contact">Start a conversation</RollingLink></SpotlightCard>
          </div>
        </div>
      </section>
      <section className="conversation-section"><div className="shell conversation-grid"><div><p className="eyebrow">The road ahead looks good</p><h2>Let&apos;s find<br />your <span>next.</span></h2></div><div><p>A question, a shortlist, or just a starting point. Tell us what you have in mind.</p><Link href="/contact" className="button primary">Start a conversation <span aria-hidden="true">↗</span></Link></div></div></section>
    </main>
  );
}
