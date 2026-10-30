"use client";
import Link from "next/link";
import { useState } from "react";
import { MAX_COMPARE, useSaved } from "./saved";

export type SavedCar = { slug: string; title: string; variant: string; price: string; meta: string };

export function SavedList({ cars }: { cars: SavedCar[] }) {
  const { saved, toggle } = useSaved();
  const [picked, setPicked] = useState<string[]>([]);
  const mine = cars.filter(c => saved.includes(c.slug));
  const pick = (slug: string) => setPicked(p => p.includes(slug) ? p.filter(s => s !== slug) : p.length < MAX_COMPARE ? [...p, slug] : p);
  if (!mine.length) return <p>No saved cars yet. <Link href="/showroom/inventory" className="link-btn">Browse the inventory</Link>. Saved cars stay in this browser only.</p>;
  return (
    <>
      <p className="meta">Saved cars stay in this browser only. Pick up to {MAX_COMPARE} to compare.</p>
      <ul className="sr-saved">
        {mine.map(c => (
          <li key={c.slug} className="sr-saved-row">
            <label><input type="checkbox" checked={picked.includes(c.slug)} onChange={() => pick(c.slug)} disabled={!picked.includes(c.slug) && picked.length >= MAX_COMPARE} /> <span className="sr-only">Compare </span>{c.title}</label>
            <span className="meta">{c.variant} / {c.meta}</span>
            <strong>{c.price}</strong>
            <Link href={`/showroom/vehicles/${c.slug}`} className="btn">View</Link>
            <button type="button" className="btn btn-ghost" onClick={() => toggle(c.slug)}>Remove<span className="sr-only"> {c.title}</span></button>
          </li>
        ))}
      </ul>
      {picked.length >= 2
        ? <Link className="btn btn-primary" href={`/showroom/compare?cars=${picked.join(",")}`}>Compare {picked.length} cars</Link>
        : <button type="button" className="btn btn-primary" disabled>Pick at least 2 to compare</button>}
    </>
  );
}
