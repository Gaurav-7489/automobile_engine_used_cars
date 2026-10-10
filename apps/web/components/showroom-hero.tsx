"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Vehicle } from "@vandlabs/contracts";
import { money } from "../lib/format";
import { RollingLink } from "./rolling-link";

export function ShowroomHero({ vehicles, dealer, cities, available, locations }: {
  vehicles: Pick<Vehicle, "id" | "slug" | "make" | "model" | "year" | "variant" | "price" | "media">[]; dealer: string; cities: string; available: number; locations: number;
}) {
  const [selectedId, setSelectedId] = useState(vehicles[0]?.id);
  const vehicle = vehicles.find(item => item.id === selectedId) ?? vehicles[0];
  const selected = vehicles.findIndex(item => item.id === vehicle?.id);

  return <section className="showroom-hero" aria-label="Featured collection">
    <div className="shell showroom-grid">
      <div className="showroom-copy">
        <p className="eyebrow">{dealer} · {cities}</p>
        <h1>Cars worth arriving in.</h1>
        <p className="lede">Your next drive. A little more extraordinary.</p>
        <div className="actions"><Link className="button primary" href="/inventory">Explore the collection <span aria-hidden="true">↗</span></Link><RollingLink href="/contact" className="hero-contact">Speak to a specialist</RollingLink></div>
      </div>
      <div className="showroom-visual">
        <div className="hero-photo" key={vehicle?.id ?? "empty"}>
          {vehicle?.media[0] ? <Image src={vehicle.media[0].url} alt={vehicle.media[0].alt} fill priority sizes="(max-width: 1200px) 100vw, 1100px" className="hero-image" unoptimized={!vehicle.media[0].url.startsWith("https://images.unsplash.com/")} /> : <span>New inventory arriving soon</span>}
          <span className="photo-index" aria-hidden="true">{String(selected + 1).padStart(2, "0")} / {String(vehicles.length).padStart(2, "0")}</span>
        </div>
        <div className="hero-details" aria-live="polite" aria-atomic="true">
          {vehicle && <Link href={"/vehicles/" + vehicle.slug} className="hero-vehicle"><div><span className="meta">{vehicle.year} · {vehicle.variant}</span><strong>{vehicle.make} {vehicle.model}</strong><small>{money(vehicle.price)} · Editorial demo photography</small></div><span className="round-arrow" aria-hidden="true">↗</span></Link>}
        </div>
        {vehicles.length > 1 && <div className="hero-selectors" role="group" aria-label="Choose a featured car">{vehicles.map((item) => <button type="button" key={item.id} onClick={() => setSelectedId(item.id)} aria-pressed={vehicle?.id === item.id} aria-label={`Feature ${item.make} ${item.model}`}><span>{item.make}</span></button>)}</div>}
      </div>
    </div>
    <div className="collection-strip"><div className="shell"><span>{available} available vehicles</span><span>{locations} studio locations</span><span>One personal conversation.</span></div></div>
  </section>;
}
