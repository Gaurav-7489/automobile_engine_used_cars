import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme";
import { CarPhoto } from "@/components/listing/car-photo";
import { SUPPORT_EMAIL } from "@/lib/support";
import { postPrice } from "@/lib/social-post";
import { MARKET_SORTS, readMarketplace, type Marketplace } from "@/lib/server/marketplace";

export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const BUDGETS = [{ value: "500000", label: "Up to ₹5 Lakh" }, { value: "1000000", label: "Up to ₹10 Lakh" }, { value: "2000000", label: "Up to ₹20 Lakh" }, { value: "4000000", label: "Up to ₹40 Lakh" }];

export const metadata: Metadata = {
  title: { absolute: "Used cars for sale from trusted dealers | VandLabs" },
  description: "Browse used cars published by dealerships on VandLabs. Photos, prices and specifications straight from each dealer's stock, with enquiries going directly to the dealer.",
  openGraph: { type: "website", title: "Used cars for sale | VandLabs", description: "Used cars from dealerships on VandLabs, straight from their stock.", locale: "en_IN" },
};

export default async function MarketplacePage({ searchParams }: { searchParams: Search }) {
  const s = await searchParams;
  const f = { q: one(s.q), make: one(s.make), fuel: one(s.fuel), city: one(s.city), sort: one(s.sort), budget: one(s.budget), page: one(s.page) };
  let market: Marketplace | null = null;
  try {
    market = await readMarketplace({ q: f.q, make: f.make, fuel: f.fuel, city: f.city, sort: f.sort, maxPrice: Number(f.budget) || undefined, page: Number(f.page) || 1 });
  } catch (error) {
    console.error(JSON.stringify({ event: "marketplace_unavailable", message: error instanceof Error ? error.message.slice(0, 160) : "unknown" }));
  }
  const filtered = Boolean(f.q || f.make || f.fuel || f.city || f.budget);
  const pageHref = (page: number) => `/cars?${new URLSearchParams(Object.entries({ ...f, page: String(page) }).filter(([, v]) => v) as [string, string][]).toString()}`;
  return (
    <div className="showroom">
      <header className="sr-header">
        <Link href="/cars" className="sr-brand" aria-label="VandLabs cars for sale"><Brand sub={false} /></Link>
        <span style={{ flex: 1 }} />
        <ThemeToggle />
        <Link href="/login" className="btn btn-sm">Dealer sign in</Link>
      </header>
      <main id="content" tabIndex={-1} className="sr-main">
        {!market ? (
          <section className="sr-section pl-missing"><h1>Cars for sale</h1><p className="muted">The marketplace is not available right now. Please try again in a few minutes.</p></section>
        ) : (
          <section className="sr-section">
            <h1 className="pl-inv-title">Used cars from trusted dealers</h1>
            <p className="muted">{market.total} car{market.total === 1 ? "" : "s"} {filtered ? "match your search" : "for sale"}{market.dealers ? ` from ${market.dealers} dealership${market.dealers === 1 ? "" : "s"}` : ""} · straight from each dealer&apos;s stock</p>
            <form className="pl-filters" method="get" action="/cars" role="search" aria-label="Search cars">
              <label className="pl-filter pl-filter-q"><span className="label">Search</span><input className="input" type="search" name="q" defaultValue={f.q} placeholder="Make, model, dealer or city" maxLength={60} /></label>
              {market.makes.length > 1 ? <label className="pl-filter"><span className="label pl-filter-label">Make</span><select className="input" name="make" defaultValue={f.make}><option value="">All makes</option>{market.makes.map((m) => <option key={m} value={m}>{m}</option>)}</select></label> : null}
              <label className="pl-filter"><span className="label pl-filter-label">Budget</span><select className="input" name="budget" defaultValue={f.budget}><option value="">Any budget</option>{BUDGETS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}</select></label>
              {market.fuels.length > 1 ? <label className="pl-filter"><span className="label pl-filter-label">Fuel</span><select className="input" name="fuel" defaultValue={f.fuel}><option value="">Any fuel</option>{market.fuels.map((x) => <option key={x} value={x}>{x}</option>)}</select></label> : null}
              {market.cities.length > 1 ? <label className="pl-filter"><span className="label pl-filter-label">City</span><select className="input" name="city" defaultValue={f.city}><option value="">All cities</option>{market.cities.map((c) => <option key={c} value={c}>{c}</option>)}</select></label> : null}
              <label className="pl-filter"><span className="label pl-filter-label">Sort</span><select className="input" name="sort" defaultValue={f.sort || "newest"}>{MARKET_SORTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
              <div className="pl-filter-actions"><button className="btn btn-primary" type="submit">Show cars</button>{filtered ? <Link className="btn" href="/cars">Clear</Link> : null}</div>
            </form>
            {market.cars.length === 0 ? (
              <div className="pl-missing"><h2>{filtered ? "No cars match" : "No cars listed yet"}</h2><p className="muted">{filtered ? "Try fewer filters or a bigger budget." : "Dealerships add cars here as they publish them. Check back soon."}</p></div>
            ) : (
              <ul className="pl-grid">
                {market.cars.map((car) => {
                  const title = [car.year, car.make, car.model].filter(Boolean).join(" ");
                  return (
                    <li key={`${car.tenantId}-${car.stockId}`}>
                      <Link className="pl-card" href={`/l/${car.tenantId}/${encodeURIComponent(car.stockId.toLowerCase())}`}>
                        <div className="pl-card-media">
                          <CarPhoto src={car.photo} alt={title} />
                          {car.availability === "reserved" ? <span className="sr-badge pl-card-badge">Reserved</span> : null}
                        </div>
                        <div className="pl-card-body">
                          <strong className="pl-card-title">{title}</strong>
                          {car.variant ? <span className="meta">{car.variant}</span> : null}
                          <span className="pl-card-price">{postPrice(car.price === null ? null : car.price * 100)}</span>
                          <span className="meta">{[`${car.km.toLocaleString("en-IN")} km`, car.fuel, car.transmission].filter(Boolean).join(" · ")}</span>
                          <span className="mk-dealer">{[car.dealer, car.city].filter(Boolean).join(" · ")}</span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {market.pages > 1 ? (
              <nav className="pl-pager" aria-label="Pages">
                {market.page > 1 ? <Link className="btn" href={pageHref(market.page - 1)}>Previous</Link> : <span />}
                <span className="meta">Page {market.page} of {market.pages}</span>
                {market.page < market.pages ? <Link className="btn" href={pageHref(market.page + 1)}>Next</Link> : <span />}
              </nav>
            ) : null}
            <p className="meta pl-note">Every car is listed by the dealership shown on it, from its own stock records. Open a car to call, message or send the dealer an enquiry. Confirm availability, price and condition with the dealer before you visit.</p>
          </section>
        )}
      </main>
      <footer className="sr-footer">
        <span className="meta">VandLabs marketplace</span>
        <span><Link href="/info/privacy">Privacy</Link> · <Link href="/info/terms">Terms</Link> · <a href={`mailto:${SUPPORT_EMAIL}?subject=Marketplace%20feedback`}>Feedback</a></span>
      </footer>
    </div>
  );
}
