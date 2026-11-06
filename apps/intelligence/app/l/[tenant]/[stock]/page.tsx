import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme";
import { readPublicListing, type PublicListing } from "@/lib/server/public-listing";
import { normalisePhone, ordinalOwner, postPrice } from "@/lib/social-post";

export const dynamic = "force-dynamic";

type Params = Promise<{ tenant: string; stock: string }>;

const load = cache(async (tenant: string, stock: string): Promise<PublicListing | null> => readPublicListing(tenant, decodeURIComponent(stock)).catch(() => null));
const titleOf = (v: PublicListing) => [v.year, v.make, v.model, v.variant].filter(Boolean).join(" ");

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { tenant, stock } = await params;
  const v = await load(tenant, stock);
  if (!v) return { title: "Vehicle not available", robots: { index: false } };
  const title = `${titleOf(v)} · ${postPrice(v.price === null ? null : v.price * 100)}`;
  const description = [`${v.km.toLocaleString("en-IN")} km`, v.fuel, v.transmission, ordinalOwner(v.owners), v.branch.city, v.dealer].filter(Boolean).join(" · ");
  const images = v.photos.slice(0, 4).map((url) => ({ url, alt: titleOf(v) }));
  return {
    title: { absolute: v.dealer ? `${title} | ${v.dealer}` : title },
    description,
    openGraph: { type: "website", title, description, images, siteName: v.dealer || undefined, locale: "en_IN" },
    twitter: { card: images.length ? "summary_large_image" : "summary", title, description, images: images.map((i) => i.url) },
  };
}

export default async function ListingPage({ params }: { params: Params }) {
  const { tenant, stock } = await params;
  const v = await load(tenant, stock);
  const phone = v ? normalisePhone(v.branch.phone) : null;
  return (
    <div className="showroom">
      <div className="ambient" aria-hidden="true" />
      <header className="sr-header">
        <span className="pl-dealer">{v?.dealer || <Brand sub={false} />}</span>
        <span style={{ flex: 1 }} />
        <ThemeToggle />
      </header>
      <main id="content" tabIndex={-1} className="sr-main">
        {!v ? (
          <section className="sr-section pl-missing">
            <h1>This vehicle is no longer available</h1>
            <p className="muted">It may have been sold or taken off the dealer&apos;s website. Contact the dealership for similar vehicles.</p>
          </section>
        ) : (
          <article className="sr-section sr-detail">
            <div className="sr-detail-grid">
              <div className="pl-gallery" aria-label="Photos">
                {v.photos.length ? (
                  <div className="pl-track" tabIndex={0} aria-label={`${v.photos.length} photos; scroll sideways for more`}>
                    {v.photos.map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={src} src={src} alt={`${titleOf(v)}, photo ${i + 1} of ${v.photos.length}`} loading={i === 0 ? "eager" : "lazy"} />
                    ))}
                  </div>
                ) : <div className="sr-detail-media pl-nophoto"><span className="meta">Photos coming soon</span></div>}
                {v.photos.length > 1 ? <p className="meta">{v.photos.length} photos · scroll sideways</p> : null}
              </div>
              <div>
                <span className={`sr-badge sr-${v.availability}`}>{v.availability}</span>
                <h1>{titleOf(v)}</h1>
                <p className="sr-price">{postPrice(v.price === null ? null : v.price * 100)}</p>
                <p className="meta">Ref {v.stockId}{v.branch.city ? ` · ${v.branch.name}, ${v.branch.city}` : ""}</p>
                <div className="sr-actions pl-actions">
                  {phone ? <a className="btn btn-primary" href={`tel:${phone}`}>Call {v.branch.phone}</a> : null}
                  {phone ? <a className="btn" href={`https://wa.me/${phone.replace("+", "")}?text=${encodeURIComponent(`Hi, I'm interested in the ${titleOf(v)} (Ref ${v.stockId}).`)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a> : null}
                  {v.branch.city ? <a className="btn" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${v.dealer} ${v.branch.name} ${v.branch.city} ${v.branch.state}`)}`} target="_blank" rel="noopener noreferrer">Directions</a> : null}
                </div>
              </div>
            </div>
            <h2>Specification</h2>
            <dl className="sr-facts">
              {([["Year", String(v.year)], ["Kilometres", `${v.km.toLocaleString("en-IN")} km`], ["Fuel", v.fuel], ["Transmission", v.transmission], ["Ownership", ordinalOwner(v.owners)], ["Body", v.bodyType], ["Colour", v.colour], ["Location", [v.branch.city, v.branch.state].filter(Boolean).join(", ")]] as [string, string][])
                .filter(([, value]) => value && value !== "0")
                .map(([k, value]) => <div key={k}><dt>{k}</dt><dd>{value}</dd></div>)}
            </dl>
            <p className="meta pl-note">Details are from the dealer&apos;s stock record. Confirm availability, price and condition with the dealership before you visit.</p>
          </article>
        )}
      </main>
      <footer className="sr-footer">
        <span className="meta">{v?.dealer ? `${v.dealer} · ` : ""}Listing by VandLabs</span>
        <span><Link href="/info/privacy">Privacy</Link> / <Link href="/info/terms">Terms</Link></span>
      </footer>
    </div>
  );
}
