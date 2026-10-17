"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Vehicle } from "@vandlabs/contracts";
import { money } from "../lib/format";
import { useShortlist } from "./shortlist";

type HeroVehicle = Pick<Vehicle, "id" | "slug" | "make" | "model" | "year" | "variant" | "price" | "media">;
type Social = { label: string; href?: string; icon: React.ReactNode };

const swatches = ["#ff3b24", "#141414", "#6f8dff", "#a9a9a9", "#a8f0a0"];

const icons = {
  facebook: <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 21v-7.5H16l.4-3H13.5V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3z" /></svg>,
  instagram: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.8" /><circle cx="16.8" cy="7.2" r="1.1" fill="currentColor" /></svg>,
  linkedin: <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 9h3v10H5zM6.5 4.5a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5zM10 9h2.9v1.4c.4-.8 1.4-1.6 2.9-1.6 3.1 0 3.7 2 3.7 4.7V19h-3v-4.8c0-1.2 0-2.6-1.6-2.6s-1.9 1.2-1.9 2.5V19h-3z" /></svg>,
  x: <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.6 4h2.8l-6.1 7 7.2 9h-5.6l-4.4-5.6L6.4 20H3.6l6.5-7.5L3.2 4h5.7l4 5.2zm-1 14.4h1.5L8 5.5H6.4z" /></svg>,
};

export function ShowroomHero({ vehicles, available, locations, social }: {
  vehicles: HeroVehicle[]; available: number; locations: number;
  social: { facebook?: string; instagram?: string; linkedin?: string; x?: string };
}) {
  const [selectedId, setSelectedId] = useState(vehicles[0]?.id);
  const { ids, toggle, ready } = useShortlist();
  const vehicle = vehicles.find(item => item.id === selectedId) ?? vehicles[0];
  const name = vehicle ? `${vehicle.make} ${vehicle.model}` : "";
  const shortlisted = vehicle ? ids.includes(vehicle.id) : false;
  const thumb = vehicle?.media[1] ?? vehicle?.media[0];
  const makes = vehicles.map(item => item.make);
  const links: Social[] = [
    { label: "Facebook", href: social.facebook, icon: icons.facebook },
    { label: "Instagram", href: social.instagram, icon: icons.instagram },
    { label: "LinkedIn", href: social.linkedin, icon: icons.linkedin },
    { label: "X", href: social.x, icon: icons.x },
  ];

  return <section className="showroom-hero" aria-label="Dealer showroom">
    <div className="shell az-hero">
      <div className="az-copy">
        <h1>Source <span className="az-accent">Quality Stock<svg viewBox="0 0 220 14" preserveAspectRatio="none" aria-hidden="true"><path d="M2 12 C 60 1, 160 1, 218 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></span> You Can Trust</h1>
        <p className="lede">Acquisition intelligence, live inventory and lead follow-up for dealership teams, with clear costs and evidence behind every buy.</p>
      </div>

      <ul className="az-social" aria-label="Follow us">
        {links.map((item, index) => <li key={item.label} className={index === 1 ? "active" : undefined}>
          {item.href ? <a href={item.href} target="_blank" rel="noopener noreferrer" aria-label={item.label}>{item.icon}</a> : <span aria-hidden="true">{item.icon}</span>}
        </li>)}
      </ul>

      <div className="az-stage">
        <div className="az-car" key={vehicle?.id ?? "empty"}>
          {vehicle?.media[0] ? <Image src={vehicle.media[0].url} alt={vehicle.media[0].alt || `${vehicle.year} ${name}`} fill priority sizes="(max-width: 960px) 100vw, 860px" className="hero-image" unoptimized={!vehicle.media[0].url.startsWith("https://images.unsplash.com/")} /> : <span>New inventory arriving soon</span>}
        </div>
        <span className="az-hotspot az-hotspot-top" aria-hidden="true" />
        <span className="az-hotspot az-hotspot-wheel" aria-hidden="true" />
        <div className="az-callout az-callout-top"><strong>{available}<small>CARS</small></strong><span>Live Inventory</span></div>
        <div className="az-callout az-callout-bottom"><strong>{locations}<small>Sites</small></strong><span>Connected</span></div>
      </div>

      <div className="az-bottom">
        {vehicles.length > 1 && <div className="az-chips hero-selectors" role="group" aria-label="Choose a featured car">
          {vehicles.map(item => <button type="button" key={item.id} onClick={() => setSelectedId(item.id)} aria-pressed={vehicle?.id === item.id} aria-label={`Feature ${item.make} ${item.model}`}>
            {makes.filter(make => make === item.make).length > 1 ? `${item.make} ${item.model}` : `${item.make} Cars`}
          </button>)}
        </div>}

        <div className="az-swatches">
          {swatches.map((color, index) => {
            const item = vehicles[index];
            const style = { "--swatch": color } as React.CSSProperties;
            return item
              ? <button type="button" key={color} style={style} onClick={() => setSelectedId(item.id)} aria-pressed={vehicle?.id === item.id} aria-label={`Show ${item.make} ${item.model}`} />
              : <span key={color} style={style} aria-hidden="true" />;
          })}
        </div>

        {vehicle && <div className="az-card">
          <button type="button" className="az-plus" aria-pressed={shortlisted} disabled={!ready} onClick={() => toggle(vehicle.id)} aria-label={shortlisted ? `Remove ${name} from compare` : `Add ${name} to compare`}>{shortlisted ? "✓" : "+"}</button>
          <Link href={"/vehicles/" + vehicle.slug} className="hero-vehicle">
            <span className="az-thumb">
              {thumb && <Image src={thumb.url} alt="" fill sizes="180px" unoptimized={!thumb.url.startsWith("https://images.unsplash.com/")} />}
              <em>{money(vehicle.price)}</em>
            </span>
            <strong>{name}</strong>
            <small>{vehicle.year} · {vehicle.variant}. Check acquisition value before you buy.</small>
          </Link>
        </div>}
      </div>
    </div>
  </section>;
}
