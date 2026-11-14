import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme";
import { SUPPORT_EMAIL } from "@/lib/support";
import { CarPhoto } from "@/components/listing/car-photo";
import { PUBLIC_SORTS, readPublicInventory, type PublicInventory } from "@/lib/server/public-listing";
import { CarFilter } from "@/components/listing/car-filter";
import { CustomerChat } from "@/components/listing/customer-chat";
import { websiteChatEnabled } from "@/lib/server/channels";
import { postPrice } from "@/lib/social-post";

export const dynamic = "force-dynamic";

type Params = Promise<{ tenant: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const FUELS = ["Petrol", "Diesel", "CNG", "Hybrid", "Electric"];

const load = cache(async (tenant: string, f: Record<string, string>): Promise<PublicInventory | null> =>
  readPublicInventory(tenant, { q: f.q, make: f.make, model: f.model, variant: f.variant, fuel: f.fuel, city: f.city, sort: f.sort, page: Number(f.page) || 1 }).catch(() => null));

const filtersOf = async (searchParams: Search) => {
  const s = await searchParams;
  return { q: one(s.q), make: one(s.make), model: one(s.model), variant: one(s.variant), fuel: one(s.fuel), city: one(s.city), sort: one(s.sort), page: one(s.page) };
};

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: Search }): Promise<Metadata> {
  const { tenant } = await params;
  const inv = await load(tenant, await filtersOf(searchParams));
  if (!inv) return { title: "Dealership not found", robots: { index: false } };
  const title = inv.dealer ? `Used cars for sale | ${inv.dealer}` : "Used cars for sale";
  const description = `${inv.total} quality used car${inv.total === 1 ? "" : "s"} available${inv.cities.length ? ` in ${inv.cities.join(", ")}` : ""}. Photos, prices and specifications${inv.dealer ? ` from ${inv.dealer}` : ""}.`;
  const image = inv.cars.find((c) => c.photo)?.photo;
  return { title: { absolute: title }, description, openGraph: { type: "website", title, description, images: image ? [{ url: image }] : [], siteName: inv.dealer || undefined, locale: "en_IN" } };
}

export default async function DealerInventory({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { tenant } = await params;
  const f = await filtersOf(searchParams);
  const inv = await load(tenant, f);
  const chat = inv ? await websiteChatEnabled(tenant.toLowerCase()) : false;
  const base = `/l/${tenant.toLowerCase()}`;
  const pageHref = (page: number) => {
    const q = new URLSearchParams(Object.entries({ ...f, page: String(page) }).filter(([, v]) => v) as [string, string][]);
    return `${base}?${q.toString()}`;
  };
  const filtered = Boolean(f.q || f.make || f.model || f.variant || f.fuel || f.city);
  return (
    <div className="showroom">
      <div className="ambient" aria-hidden="true" />
      <header className="sr-header">
        <Link href={base} className="pl-dealer">{inv?.dealer || <Brand sub={false} />}</Link>
        <span style={{ flex: 1 }} />
        <ThemeToggle />
      </header>
      <main id="content" tabIndex={-1} className="sr-main">
        {!inv ? (
          <section className="sr-section pl-missing"><h1>Dealership not found</h1><p className="muted">Check the link you were given.</p></section>
        ) : (
          <section className="sr-section">
            <h1 className="pl-inv-title">Cars for sale{inv.dealer ? ` at ${inv.dealer}` : ""}</h1>
            <p className="muted">{inv.total} car{inv.total === 1 ? "" : "s"} {filtered ? "match your search" : "available"}{inv.cities.length ? ` · ${inv.cities.join(", ")}` : ""}</p>
            <form className="pl-filters" method="get" action={base} role="search" aria-label="Search cars">
              <label className="pl-filter pl-filter-q"><span className="label">Search</span><input className="input" type="search" name="q" defaultValue={f.q} placeholder="Make or model, e.g. Creta" maxLength={60} /></label>
              <CarFilter initial={{ make: f.make, model: f.model, variant: f.variant }} brands={inv.makes} />
              <label className="pl-filter"><span className="label pl-filter-label">Fuel</span><select className="input" name="fuel" defaultValue={f.fuel}><option value="">Any fuel</option>{FUELS.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
              {inv.cities.length > 1 ? <label className="pl-filter"><span className="label pl-filter-label">City</span><select className="input" name="city" defaultValue={f.city}><option value="">All cities</option>{inv.cities.map((c) => <option key={c} value={c}>{c}</option>)}</select></label> : null}
              <label className="pl-filter"><span className="label pl-filter-label">Sort</span><select className="input" name="sort" defaultValue={f.sort || "newest"}>{PUBLIC_SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
              <div className="pl-filter-actions"><button className="btn btn-primary" type="submit">Show cars</button>{filtered ? <Link className="btn" href={base}>Clear</Link> : null}</div>
            </form>
            {inv.cars.length === 0 ? (
              <div className="pl-missing"><h2>No cars match</h2><p className="muted">{filtered ? "Try fewer filters." : "New stock is on its way. Check back soon."}</p></div>
            ) : (
              <ul className="pl-grid">
                {inv.cars.map((car) => {
                  const title = [car.year, car.make, car.model].filter(Boolean).join(" ");
                  return (
                    <li key={car.stockId}>
                      <Link className="pl-card" href={`${base}/${encodeURIComponent(car.stockId.toLowerCase())}`}>
                        <div className="pl-card-media">
                          <CarPhoto src={car.photo} alt={title} />
                          {car.availability === "reserved" ? <span className="sr-badge pl-card-badge">Reserved</span> : null}
                        </div>
                        <div className="pl-card-body">
                          <strong className="pl-card-title">{title}</strong>
                          {car.variant ? <span className="meta">{car.variant}</span> : null}
                          <span className="pl-card-price">{postPrice(car.price === null ? null : car.price * 100)}</span>
                          <span className="meta">{[`${car.km.toLocaleString("en-IN")} km`, car.fuel, car.transmission, car.city].filter(Boolean).join(" · ")}</span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {inv.pages > 1 ? (
              <nav className="pl-pager" aria-label="Pages">
                {inv.page > 1 ? <Link className="btn" href={pageHref(inv.page - 1)}>Previous</Link> : <span />}
                <span className="meta">Page {inv.page} of {inv.pages}</span>
                {inv.page < inv.pages ? <Link className="btn" href={pageHref(inv.page + 1)}>Next</Link> : <span />}
              </nav>
            ) : null}
          </section>
        )}
      </main>
      {inv && chat ? <CustomerChat tenant={tenant.toLowerCase()} dealer={inv.dealer} /> : null}
      <footer className="sr-footer">
        <span className="meta">{inv?.dealer ? `${inv.dealer} · ` : ""}Listing by VandLabs</span>
        <span><Link href="/info/privacy">Privacy</Link> / <Link href="/info/terms">Terms</Link> / <a href={`mailto:${SUPPORT_EMAIL}?subject=Showroom%20feedback`}>Feedback</a></span>
      </footer>
    </div>
  );
}
