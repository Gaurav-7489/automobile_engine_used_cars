import Link from "next/link";
import type { Metadata } from "next";
import { discover, sanitizeTurns } from "@vandlabs/data/discovery";
import { ShowroomGrid } from "@/components/showroom/vehicle-card";
import { sampleVehicles, showroomLocations } from "@/lib/showroom";

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
      <h1 className="pl-inv-title">Discover</h1>
      <p className="meta">Describe the car you need in plain words: budget, city, body type, fuel, family size.</p>
      <form className="pl-filters" method="get" action="/showroom/discover" role="search" aria-label="Discover cars">
        <label className="pl-filter pl-filter-q"><span className="label">What are you looking for?</span><input className="input" name="q" type="search" defaultValue={turns.at(-1) ?? ""} placeholder="e.g. automatic SUV under 40 lakh" maxLength={300} /></label>
        <div className="pl-filter-actions"><button className="btn btn-primary" type="submit">Search</button></div>
      </form>
      {!turns.length ? <ul className="sr-chips" aria-label="Example searches">{EXAMPLES.map(e => <li key={e}><Link className="btn" href={`/showroom/discover?q=${encodeURIComponent(e)}`}>{e}</Link></li>)}</ul> : null}
      {turns.length ? <>
        <p role="status">{result.reply}</p>
        {result.chips.length ? <ul className="sr-chips" aria-label="Understood requirements">{result.chips.map(c => <li key={c.key} className="sr-badge">{c.label}</li>)}</ul> : null}
        {result.notices.map(n => <p key={n.text} className="meta">{n.text}</p>)}
        <ShowroomGrid vehicles={result.results.map((m) => byId.get(m.vehicleId)).filter((v): v is NonNullable<typeof v> => Boolean(v))} extra={(v) => { const match = result.results.find((m) => m.vehicleId === v.id)!; return <>
          <span className="meta">{match.summary}</span>
          {match.strengths.length ? <span className="meta">Fits: {match.strengths.join(", ")}</span> : null}
          {match.caveats.length ? <span className="meta">Check: {match.caveats.join(", ")}</span> : null}
        </>; }} />
        {!result.results.length ? <p>No cars match. Try fewer requirements.</p> : null}
      </> : null}
    </section>
  );
}
