import Link from "next/link";
import { ShowroomCard } from "@/components/showroom/vehicle-card";
import { sampleVehicles } from "@/lib/showroom";

export default function ShowroomHome() {
  const all = sampleVehicles();
  const available = all.filter(v => v.availabilityStatus === "available");
  return (
    <>
      <section className="sr-hero">
        <p className="eyebrow">Showroom</p>
        <h1>Find the car that fits.<br />See the evidence behind it.</h1>
        <p className="lede">Browse the sample catalogue the way a dealership team sees it: real specification fields, no invented claims, and anything unrecorded marked as unknown.</p>
        <div className="sr-actions">
          <Link href="/showroom/inventory" className="btn btn-primary">Browse {available.length} available cars</Link>
          <Link href="/login" className="btn">Dealer sign in</Link>
        </div>
      </section>
      <section aria-labelledby="sr-latest" className="sr-section">
        <h2 id="sr-latest">Ready to view</h2>
        <div className="sr-grid">{available.slice(0, 6).map(v => <ShowroomCard key={v.id} vehicle={v} />)}</div>
        <p><Link href="/showroom/inventory" className="link-btn">See every car</Link></p>
      </section>
      <section aria-labelledby="sr-how" className="sr-section sr-how">
        <h2 id="sr-how">One platform, both sides</h2>
        <ol>
          <li><h3>Browse</h3><p>Filter by body type, fuel and price. Every figure comes from the stock record.</p></li>
          <li><h3>Compare</h3><p>Open a car for its full specification, features and location.</p></li>
          <li><h3>Run the dealership</h3><p>Dealership teams sign in to manage stock, leads, pricing and reports in the same design.</p></li>
        </ol>
      </section>
    </>
  );
}
