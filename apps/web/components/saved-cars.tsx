"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReelCard } from "../lib/discovery";
import { number, rupees } from "../lib/format";
import { SaveButton, useSaved } from "./saved";

const statusLabel = { available: "Available", reserved: "Reserved", sold: "Sold" } as const;

export function SavedCars({ editorial }: { editorial: boolean }) {
  const { ids, ready, clear } = useSaved();
  const [cards, setCards] = useState<ReelCard[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const key = ids.join(",");
  useEffect(() => {
    if (!ready) return;
    if (!key) { setCards([]); return; }
    const controller = new AbortController();
    setFailed(false);
    fetch(`/api/discover/cards?ids=${encodeURIComponent(key)}`, { signal: controller.signal, headers: { accept: "application/json" } })
      .then(response => response.ok ? response.json() as Promise<{ cards: ReelCard[] }> : Promise.reject(new Error(String(response.status))))
      .then(data => setCards(key.split(",").map(id => data.cards.find(card => card.id === id)).filter((card): card is ReelCard => Boolean(card))))
      .catch(error => { if ((error as Error).name !== "AbortError") setFailed(true); });
    return () => controller.abort();
  }, [ready, key]);
  useEffect(() => { setCompare(current => current.filter(id => ids.includes(id))); }, [key, ids]);

  if (!ready || (cards === null && !failed)) return <p className="saved-status" role="status">Loading your saved cars…</p>;
  if (failed) return <p className="saved-status" role="alert">Saved cars couldn&apos;t load. Refresh to try again — your list is still saved in this browser.</p>;
  if (!cards?.length) return <div className="saved-empty">
    <span aria-hidden="true">♡</span><h2>No saved cars yet</h2>
    <p>Tap the heart on any car while you browse. Saved cars stay in this browser — nothing is sent anywhere until you enquire.</p>
    <Link className="button primary" href="/discover">Discover cars</Link>
  </div>;
  const toggleCompare = (id: string) => setCompare(current => current.includes(id) ? current.filter(item => item !== id) : current.length >= 3 ? current : [...current, id]);
  return <div className="saved-layout">
    <div className="saved-bar">
      <p role="status">{cards.length} saved {cards.length === 1 ? "car" : "cars"}{compare.length ? ` · ${compare.length} selected to compare` : ""}</p>
      <div>{compare.length >= 2 && <Link className="button primary compact" href={`/compare?ids=${compare.join(",")}`}>Compare {compare.length}</Link>}<button type="button" className="text-button" onClick={clear}>Clear all</button></div>
    </div>
    <ul className="saved-grid">{cards.map(card => {
      const title = `${card.year} ${card.make} ${card.model}`, photo = card.media.find(item => item.kind === "photo");
      return <li key={card.id} className={`saved-card is-${card.availability}`}>
        <Link href={`/vehicles/${card.slug}`} className="saved-media" aria-label={`${title} details`}>
          {photo ? <Image src={photo.url} alt={photo.alt || title} fill sizes="(max-width: 700px) 100vw, 33vw" unoptimized={!photo.url.startsWith("https://images.unsplash.com/")} /> : <span>Photos coming soon</span>}
          <span className={`saved-status-badge ${card.availability}`}>{statusLabel[card.availability]}</span>
        </Link>
        <div className="saved-body">
          <p className="saved-dealer">{card.dealership}{card.location ? ` · ${card.location.city}` : ""}</p>
          <h2>{title}</h2>
          <p className="saved-variant">{card.variant}</p>
          <p className="saved-price">{card.price > 0 ? rupees(card.price) : "Price on request"}</p>
          <p className="saved-facts">{number(card.mileage)} km · {card.fuelType} · {card.transmission}</p>
          <div className="saved-actions">
            {card.availability === "available" ? <Link className="button compact" href={`/contact?vehicle=${card.id}`}>Enquire</Link> : <span className="saved-note">{card.availability === "sold" ? "This car has been sold." : "Reserved — ask about availability."}</span>}
            <label className="saved-compare"><input type="checkbox" checked={compare.includes(card.id)} disabled={!compare.includes(card.id) && compare.length >= 3} onChange={() => toggleCompare(card.id)} /> Compare</label>
            <SaveButton id={card.id} name={title} className="saved-remove" showLabel />
          </div>
        </div>
      </li>;
    })}</ul>
    {editorial && <p className="saved-disclosure">Photos in this reference showroom are editorial and may not show the exact car. Confirm photos with the dealer.</p>}
  </div>;
}
