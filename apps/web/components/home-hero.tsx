"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { ReelCard } from "../lib/discovery";
import { number, rupees } from "../lib/format";
import { Composer } from "./discover/composer";
import { SaveButton } from "./saved";

const palette: [RegExp, string][] = [
  [/white|pearl|polar|crystal|ivory/i, "#f3f2ef"], [/black|onyx|obsidian|mythos|midnight/i, "#17171a"], [/silver/i, "#c5c8cc"],
  [/grey|gray|selenite|graphite|storm/i, "#7f8388"], [/blue|navarra|teal|azure/i, "#2e4f8f"], [/red|maroon|wine/i, "#b3261e"],
  [/green|olive|forest/i, "#2f6b4f"], [/gold|champagne/i, "#c4a056"], [/brown|bronze|copper/i, "#6e4f39"], [/orange/i, "#e0702a"], [/yellow/i, "#e3bf3d"], [/beige|sand/i, "#d6c6a5"],
];
const swatch = (colour: string) => palette.find(([pattern]) => pattern.test(colour))?.[1] ?? "#b9b4ad";
const optimized = (url: string) => url.startsWith("https://images.unsplash.com/");

export function HomeHero({ cars, available, cities, examples, editorial }: { cars: ReelCard[]; available: number; cities: string[]; examples: string[]; editorial: boolean }) {
  const [selected, setSelected] = useState(0);
  const car = cars[selected] ?? cars[0];
  const photo = car?.media.find(item => item.kind === "photo");
  const thumb = car?.media.filter(item => item.kind === "photo")[1] ?? photo;
  const title = car ? `${car.year} ${car.make} ${car.model}` : "";
  return <section className="va-hero" aria-labelledby="hero-title">
    <div className="shell hero-inner">
      <div className="va-hero-copy">
        <h1 id="hero-title" aria-label="Discover the right car, just by asking.">Discover the <span className="hero-accent">right car</span>, just by asking.</h1>
        <p className="hero-lede">Describe what you need in your own words. We search real, available cars from participating dealers and explain every match — nothing invented, nothing hidden.</p>
        <Composer examples={examples} />
        {examples.length > 0 && <ul className="hero-examples" aria-label="Example searches">{examples.slice(0, 4).map(example => <li key={example}><Link href={`/discover?q=${encodeURIComponent(example)}`}>{example}</Link></li>)}</ul>}
      </div>

      {car && <div className="hero-stage">
        <figure className="hero-figure" key={car.id}>
          {photo ? <Image src={photo.url} alt={photo.alt || title} fill priority sizes="(max-width: 900px) 100vw, 1100px" unoptimized={!optimized(photo.url)} /> : <span className="hero-pending">Photos coming soon</span>}
          {editorial && <figcaption>Editorial photo — not this exact car</figcaption>}
        </figure>
        <div className="hero-bubble hero-bubble-km"><i className="hero-hotspot" aria-hidden="true" /><strong>{number(car.mileage)}<small>km</small></strong><span>On the odometer</span></div>
        <div className="hero-bubble hero-bubble-year"><i className="hero-hotspot" aria-hidden="true" /><strong>{car.year}</strong><span>{car.fuelType === "electric" ? "Electric" : car.transmission === "automatic" ? "Automatic" : "Manual"}</span></div>

        {cars.length > 1 && <div className="hero-swatches" role="group" aria-label="Featured cars by colour">
          {cars.map((item, index) => <button key={item.id} type="button" style={{ ["--swatch" as string]: swatch(item.exteriorColor) }} aria-pressed={index === selected} onClick={() => setSelected(index)} aria-label={`Show ${item.year} ${item.make} ${item.model}${item.exteriorColor ? ` in ${item.exteriorColor}` : ""}`} />)}
        </div>}

        <div className="hero-bottom">
          {cars.length > 1 && <div className="hero-models" role="group" aria-label="Featured cars">
            {cars.map((item, index) => <button key={item.id} type="button" aria-pressed={index === selected} onClick={() => setSelected(index)}>{item.make} {item.model}</button>)}
          </div>}
          <article className="hero-card">
            <div className="hero-card-media">{thumb && <Image src={thumb.url} alt="" fill sizes="200px" unoptimized={!optimized(thumb.url)} />}<span>{car.price > 0 ? rupees(car.price) : "Price on request"}</span></div>
            <SaveButton id={car.id} name={title} className="hero-save" />
            <h2>{title}</h2>
            <p>{car.variant}{car.location ? ` · ${car.location.city}` : ""}</p>
            <Link href={`/discover?v=${encodeURIComponent(car.slug)}`}>See it in Discover <span aria-hidden="true">→</span></Link>
          </article>
        </div>
      </div>}

      <ul className="hero-proof" aria-label="Showroom at a glance">
        <li><strong>{available}</strong> {available === 1 ? "car" : "cars"} available now</li>
        {cities.length > 0 && <li>Listed in {cities.join(" & ")}</li>}
        <li>Updated from live dealer inventory</li>
      </ul>
    </div>
  </section>;
}
