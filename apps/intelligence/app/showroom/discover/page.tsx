import Link from "next/link";
import type { Metadata } from "next";
import { discover, sanitizeTurns } from "@vandlabs/data/discovery";
import { CarImage } from "@/components/showroom/car-image";
import { km, money, sampleLocation, sampleVehicles, showroomLocations } from "@/lib/showroom";

export const metadata: Metadata = { title: "Discover" };

const EXAMPLES = ["Automatic SUV under 40 lakh", "Family car with good mileage", "First-owner sedan, newest first", "Electric or hybrid in Bengaluru"];

/** Plain-language search. The matching engine is deterministic and rule-based: it only uses recorded fields and says what it could not match. */
export default async function Discover({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q } = await searchParams;
  const turns = sanitizeTurns(q);
  const vehicles = sampleVehicles();
  const result = discover({ turns, vehicles, locations: showroomLocations, limit: 12 });
  const byId = new Map(vehicles.map(v => [v.id, v]));
  return (
    <section className="sr-section">
      <h1>Discover</h1>
      <p className="meta">Describe the car you need in plain words: budget, city, body type, fuel, family size.</p>
      <form className="sr-filters" role="search" aria-label="Discover cars">
        <label className="sr-grow">What are you looking for?<input name="q" type="search" defaultValue={turns.at(-1) ?? ""} placeholder="e.g. automatic SUV under 40 lakh" maxLength={300} /></label>
        <button className="btn btn-primary" type="submit">Search</button>
      </form>
      {!turns.length ? <ul className="sr-chips" aria-label="Example searches">{EXAMPLES.map(e => <li key={e}><Link className="btn" href={`/showroom/discover?q=${encodeURIComponent(e)}`}>{e}</Link></li>)}</ul> : null}
      {turns.length ? <>
        <p role="status">{result.reply}</p>
        {result.chips.length ? <ul className="sr-chips" aria-label="Understood requirements">{result.chips.map(c => <li key={c.key} className="sr-badge">{c.label}</li>)}</ul> : null}
        {result.notices.map(n => <p key={n.text} className="meta">{n.text}</p>)}
        <div className="sr-grid">
          {result.results.map(match => { const v = byId.get(match.vehicleId); if (!v) return null; return (
            <Link key={v.id} href={`/showroom/vehicles/${v.slug}`} className="sr-card" data-lift>
              <div className="sr-card-media"><CarImage src={v.media[0]?.url} alt="" /></div>
              <div className="sr-card-body">
                <span className="meta">{v.year} / {km(v.mileage)} / {sampleLocation(v.locationId)}</span>
                <h3>{v.make} {v.model}</h3>
                <p className="meta">{match.summary}</p>
                {match.strengths.length ? <p className="meta">Fits: {match.strengths.join(", ")}</p> : null}
                {match.caveats.length ? <p className="meta">Check: {match.caveats.join(", ")}</p> : null}
                <strong>{money(v.price)}</strong>
              </div>
            </Link>); })}
        </div>
        {!result.results.length ? <p>No cars match. Try fewer requirements.</p> : null}
      </> : null}
    </section>
  );
}
