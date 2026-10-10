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
        <p className="eyebrow"><span className="live-dot" /> {dealer} · {cities}</p>
        <span className="hero-kicker">A NEW PERSPECTIVE ON PRE-OWNED</span>
        <h1>Cars worth <br /><span className="hero-highlight">arriving</span> in.</h1>
        <p className="lede">Good cars. Great possibilities. Find a drive that feels like you — with clear details and a real person to help you choose.</p>
        <div className="actions"><Link className="button primary shimmer-button" href="/inventory">Explore {available} available cars <span aria-hidden="true">↗</span></Link><RollingLink href="/contact" className="hero-contact">Speak to a specialist</RollingLink></div>
        <div className="showroom-proof"><div><strong>{available.toString().padStart(2, "0")}</strong><span>Available vehicles</span></div><div><strong>{locations.toString().padStart(2, "0")}</strong><span>Studio locations</span></div><div><strong>One</strong><span>Personal conversation</span></div></div>
      </div>
      <div className="showroom-visual">
        <div className="showroom-ring" aria-hidden="true" />
        <div className="hero-sticker" aria-hidden="true"><span>FIND YOUR</span><strong>next.</strong><span>GREAT DRIVE ↗</span></div>
        <div className="hero-photo" key={vehicle?.id ?? "empty"}>
          {vehicle?.media[0] ? <Image src={vehicle.media[0].url} alt={vehicle.media[0].alt} fill priority sizes="(max-width: 900px) 100vw, 55vw" className="hero-image" unoptimized={!vehicle.media[0].url.startsWith("https://images.unsplash.com/")} /> : <span>New inventory arriving soon</span>}
          <span className="photo-label">THE SELECT COLLECTION <span aria-hidden="true">↗</span></span>
          <span className="photo-index" aria-hidden="true">{String(selected + 1).padStart(2, "0")} / {String(vehicles.length).padStart(2, "0")}</span>
        </div>
        <div className="hero-details" aria-live="polite" aria-atomic="true">
          {vehicle && <Link href={"/vehicles/" + vehicle.slug} className="hero-vehicle"><div><span className="meta">{vehicle.year} · {vehicle.variant}</span><strong>{vehicle.make} {vehicle.model}</strong><small>{money(vehicle.price)} · Editorial demo photography</small></div><span className="round-arrow" aria-hidden="true">↗</span></Link>}
        </div>
        {vehicles.length > 1 && <div className="hero-selectors" role="group" aria-label="Choose a featured car">{vehicles.map((item, index) => <button type="button" key={item.id} onClick={() => setSelectedId(item.id)} aria-pressed={vehicle?.id === item.id} aria-label={`Feature ${item.make} ${item.model}`}><span className="selector-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><span>{item.make}</span><span aria-hidden="true">↗</span></button>)}</div>}
        <span className="hero-caption">Different journeys. One place to start.</span>
      </div>
    </div>
    <div className="collection-strip"><div className="shell"><span>YOUR NEXT CHAPTER STARTS HERE</span><span>Discover <i>✳</i> Compare <i>✳</i> Connect <i>✳</i> Drive</span></div></div>
  </section>;
}
