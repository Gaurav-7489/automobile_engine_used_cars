import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CarImage } from "@/components/showroom/car-image";
import { SaveButton } from "@/components/showroom/saved";
import { cap, km, money, sampleLocation, sampleVehicle } from "@/lib/showroom";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const v = sampleVehicle((await params).slug);
  return { title: v ? `${v.year} ${v.make} ${v.model}` : "Vehicle" };
}

/** Laid out like a dealership's car page (/l/{tenant}/{stock}). Sample cars take no enquiries, so there is no form. */
export default async function VehiclePage({ params }: { params: Params }) {
  const v = sampleVehicle((await params).slug);
  if (!v) notFound();
  const title = `${v.year} ${v.make} ${v.model}`;
  const facts: [string, string][] = [
    ["Year", String(v.year)], ["Kilometres", km(v.mileage)], ["Fuel", v.fuelType], ["Transmission", v.transmission],
    ["Owners", String(v.ownership)], ["Body", v.bodyType], ["Condition", v.condition], ["Colour", `${v.exteriorColor} / ${v.interiorColor}`],
    ["Location", sampleLocation(v.locationId)], ...Object.entries(v.specifications).map(([k, val]) => [cap(k), String(val)] as [string, string]),
  ].map(([k, val]) => [k, cap(val)] as [string, string]);
  const photos = v.media.filter((m) => m.url);
  return (
    <article className="sr-section sr-detail pl-listing">
      <p className="pl-back"><Link href="/showroom/inventory" className="link-btn">All sample cars</Link></p>
      <div className="sr-detail-grid">
        <div className="pl-gallery" aria-label="Photos">
          {photos.length > 1 ? (
            <div className="pl-track" tabIndex={0} aria-label={`${photos.length} photos; scroll sideways for more`}>
              {photos.map((m, i) => <div key={m.url} className="pl-slide"><CarImage src={m.url} alt={`${title}, photo ${i + 1} of ${photos.length}`} /></div>)}
            </div>
          ) : (
            <div className="pl-track"><div className="pl-slide"><CarImage src={photos[0]?.url} alt={title} /></div></div>
          )}
          {photos.length > 1 ? <p className="meta">{photos.length} photos · scroll sideways</p> : null}
        </div>
        <div>
          <span className={`sr-badge sr-${v.availabilityStatus}`}>{v.availabilityStatus}</span>
          <h1>{[title, v.variant].filter(Boolean).join(" ")}</h1>
          <p className="sr-price">{money(v.price)}</p>
          <p className="meta">Sample car · {sampleLocation(v.locationId)}</p>
          <div className="sr-actions pl-actions"><SaveButton slug={v.slug} label={`${v.make} ${v.model}`} /><Link href="/login" className="btn btn-primary">Dealer sign in</Link></div>
          <p className="meta pl-note">This is a sample catalogue and does not take enquiries. On a dealership&apos;s own showroom, this space holds Call, WhatsApp, Directions and an enquiry form that reaches the dealer as a lead.</p>
        </div>
      </div>
      <h2>Specification</h2>
      <dl className="sr-facts">{facts.map(([k, val]) => <div key={k}><dt>{k}</dt><dd>{val}</dd></div>)}</dl>
      {v.features.length ? <><h2>Features</h2><ul className="sr-features">{v.features.map((f) => <li key={f}>{f}</li>)}</ul></> : null}
    </article>
  );
}
