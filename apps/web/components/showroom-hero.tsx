import Image from "next/image";
import Link from "next/link";
import type { Vehicle } from "@vandlabs/contracts";
import { money } from "../lib/format";

export function ShowroomHero({ vehicle, dealer, cities, available, locations }: {
  vehicle?: Vehicle; dealer: string; cities: string; available: number; locations: number;
}) {
  return <section className="showroom-hero">
    <div className="shell showroom-grid">
      <div className="showroom-copy">
        <p className="eyebrow"><span className="live-dot" /> {dealer} · {cities}</p>
        <h1>Cars worth <br />arriving in.</h1>
        <p className="lede">Your next chapter deserves an exceptional drive. Discover premium pre-owned cars, with the details that make a decision feel right.</p>
        <div className="actions"><Link className="button primary" href="/inventory">Explore {available} available cars <span aria-hidden="true">↗</span></Link><Link className="button quiet" href="/contact">Speak to a specialist</Link></div>
        <div className="showroom-proof"><div><strong>{available.toString().padStart(2, "0")}</strong><span>Available vehicles</span></div><div><strong>{locations.toString().padStart(2, "0")}</strong><span>Studio locations</span></div><div><strong>One</strong><span>Personal conversation</span></div></div>
      </div>
      <div className="showroom-visual">
        <div className="showroom-ring" aria-hidden="true" />
        <div className="editorial-stamp">THE SELECT COLLECTION <span>PRE-OWNED / RECONSIDERED</span></div>
        <div className="hero-photo">{vehicle?.media[0] ? <Image src={vehicle.media[0].url} alt={vehicle.media[0].alt} fill priority sizes="(max-width: 900px) 100vw, 55vw" className="hero-image" unoptimized={!vehicle.media[0].url.startsWith("https://images.unsplash.com/")} /> : <span>New inventory arriving soon</span>}</div>
        {vehicle && <Link href={"/vehicles/" + vehicle.slug} className="hero-vehicle"><div><span className="meta">{vehicle.year} · {vehicle.variant}</span><strong>{vehicle.make} {vehicle.model}</strong><small>{money(vehicle.price)} · Editorial demo photography</small></div><span className="round-arrow" aria-hidden="true">↗</span></Link>}
        <span className="hero-caption">A better way to find what moves you.</span>
      </div>
    </div>
    <div className="collection-strip"><div className="shell"><span>Considered choices. Clear conversations.</span><span>Discover <i>/</i> Compare <i>/</i> Connect <i>/</i> Drive</span></div></div>
  </section>;
}
