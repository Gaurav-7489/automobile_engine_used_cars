import Link from "next/link";
import { activeDealership, tenantConfig } from "../lib/config";
import { BrandMark } from "./site-header";

export function SiteFooter() {
  const editorial = !["aurora", "neon"].includes(process.env.DATA_MODE ?? "");
  return (
    <footer className="footer">
      <div className="shell footer-grid">
        <div className="footer-brand">
          <p className="footer-logo"><BrandMark id="vl-mark-footer" /> VandLabs Auto</p>
          <p>AI car discovery built on real dealership inventory. Ask in plain words, browse one car at a time, talk to a person.</p>
        </div>
        <nav aria-label="Footer" className="footer-links">
          <div><p className="footer-label">Discover</p><Link href="/discover">AI search</Link><Link href="/inventory">All cars</Link><Link href="/saved">Saved cars</Link><Link href="/compare">Compare</Link></div>
          <div><p className="footer-label">VandLabs</p><Link href="/dealer">For dealers</Link><Link href="/download">Desktop app</Link><Link href="/contact">Contact</Link></div>
          <div><p className="footer-label">Legal</p><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
        </nav>
        <div className="footer-dealer">
          <p className="footer-label">Listings from</p>
          <p>{activeDealership.name}</p>
          {activeDealership.locations.map(location => <p key={location.id}>{location.name} · {location.city}</p>)}
          <p><a href={"tel:" + tenantConfig.contact.phone}>{tenantConfig.contact.phone}</a></p>
          <p><a href={"mailto:" + tenantConfig.contact.email}>{tenantConfig.contact.email}</a></p>
        </div>
      </div>
      <div className="shell footer-bottom">
        <span>© {new Date().getUTCFullYear()} VandLabs · Powered by VandLabs Automobile Engine</span>
        <span>{editorial ? "Reference showroom with sample listings and editorial photos." : "Listings, prices and photos are supplied by the dealership."}</span>
      </div>
    </footer>
  );
}
