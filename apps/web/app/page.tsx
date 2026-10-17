import Link from "next/link";
import type { Vehicle } from "@vandlabs/contracts";
import { discover } from "@vandlabs/data/discovery";
import { HomeHero } from "../components/home-hero";
import { VehicleCard } from "../components/vehicle-card";
import { dealershipService } from "../lib/services";
import { tenantConfig } from "../lib/config";
import { discoverHref, editorialMedia, locations, reelCard } from "../lib/discovery";
import { dealershipJsonLd, pageMetadata, serializeJsonLd } from "../lib/seo";

/** Example searches are built from the current stock and kept only when they return cars. */
function searches(inventory: Vehicle[]) {
  const available = inventory.filter(vehicle => vehicle.publishStatus === "published" && vehicle.availabilityStatus === "available" && vehicle.price > 0);
  const count = (turn: string) => discover({ turns: [turn], vehicles: inventory, locations, limit: 1 }).total;
  const lakh = (values: number[]) => Math.ceil(values.sort((a, b) => a - b)[Math.floor(values.length / 2)] / 1e5);
  const suvPrices = available.filter(vehicle => /suv/i.test(vehicle.bodyType)).map(vehicle => vehicle.price);
  const busiest = [...new Set(available.map(vehicle => vehicle.locationId))].map(id => ({ city: locations.find(location => location.id === id)?.city, n: available.filter(vehicle => vehicle.locationId === id).length })).sort((a, b) => b.n - a.n)[0]?.city;
  const examples = [
    suvPrices.length ? `Automatic SUV under ₹${lakh(suvPrices)} lakh${busiest ? ` in ${busiest}` : ""}` : "",
    "Family car with good mileage",
    "First-owner sedan, newest first",
    available.length ? `Under ₹${lakh(available.map(vehicle => vehicle.price))} lakh with low kilometres` : "",
  ].filter(turn => turn && count(turn) > 0);
  const popular = [
    ["SUVs", "SUV"], ["Automatic", "automatic"], ["Electric & hybrid", "electric or hybrid"], ["Diesel", "diesel"], ["First owner", "first owner"],
    ["7-seaters", "7 seater"], ...[...new Set(locations.map(location => location.city))].map(city => [`In ${city}`, `cars in ${city}`]),
  ].map(([label, turn]) => ({ label, turn, total: count(turn) })).filter(item => item.total > 0);
  return { examples, popular };
}

export default async function Page() {
  const inventory = await dealershipService.inventory();
  const ranked = discover({ turns: [], vehicles: inventory, locations, limit: 24 });
  const byId = new Map(inventory.map(vehicle => [vehicle.id, vehicle]));
  const top = ranked.results.map(match => byId.get(match.vehicleId)).filter((vehicle): vehicle is Vehicle => Boolean(vehicle));
  const featured = top.filter(vehicle => vehicle.media.length).slice(0, 5);
  const latest = [...top].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id)).slice(0, 3);
  const { examples, popular } = searches(inventory);
  const cities = [...new Set(locations.map(location => location.city))];
  const locationName = (id: string) => locations.find(location => location.id === id)?.name;
  return <main className="home">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(dealershipJsonLd(tenantConfig)) }} />
    <HomeHero cars={featured.map(reelCard)} available={ranked.total} cities={cities} examples={examples} editorial={editorialMedia()} />

    {popular.length > 0 && <section className="shell home-section home-popular" aria-labelledby="popular-title">
      <div className="home-head"><h2 id="popular-title">Popular right now</h2><Link href="/discover" className="home-link">Open Discover <span aria-hidden="true">→</span></Link></div>
      <ul>{popular.map(item => <li key={item.turn}><Link href={discoverHref([item.turn])}><span>{item.label}</span><small>{item.total} {item.total === 1 ? "car" : "cars"}</small></Link></li>)}</ul>
    </section>}

    <section className="shell home-section home-how" aria-labelledby="how-title">
      <div className="home-head"><h2 id="how-title">Ask. Browse. Talk to the dealer.</h2></div>
      <ol>
        <li><span aria-hidden="true">01</span><h3>Ask in your own words</h3><p>Budget, city, body type, fuel, family size. Then refine like a conversation — “only automatic”, “better mileage”.</p></li>
        <li><span aria-hidden="true">02</span><h3>Browse one car at a time</h3><p>Swipe through matching cars. Each one says why it fits, and what still needs checking with the dealer.</p></li>
        <li><span aria-hidden="true">03</span><h3>Reach a real person</h3><p>Enquire, book a test drive, WhatsApp or call. Your request reaches the dealership with the car attached.</p></li>
      </ol>
    </section>

    {latest.length > 0 && <section className="shell home-section home-latest" aria-labelledby="latest-title">
      <div className="home-head"><h2 id="latest-title">Ready to view</h2><Link href="/inventory" className="home-link">See every car <span aria-hidden="true">→</span></Link></div>
      <div className="inventory-grid">{latest.map(vehicle => <VehicleCard key={vehicle.id} vehicle={vehicle} locationLabel={locationName(vehicle.locationId)} />)}</div>
    </section>}

    <section className="shell home-section home-grounded" aria-labelledby="grounded-title">
      <span className="grounded-mark" aria-hidden="true">✦</span>
      <div><h2 id="grounded-title">Grounded by design.</h2><p>Results come only from published dealer inventory that is available today. The AI explains matches; it never invents prices, mileage, condition or service history, and anything that isn&apos;t recorded is clearly marked.</p></div>
      <Link className="button primary" href="/discover">Start discovering</Link>
    </section>
  </main>;
}

export const metadata = pageMetadata("AI Used Car Discovery", "Describe the car you need in plain words. Browse real, available used cars one at a time, see why each one fits, and contact the dealership.", "/");
