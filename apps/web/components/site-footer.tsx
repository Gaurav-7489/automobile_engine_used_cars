import Link from "next/link";
import { activeDealership, tenantConfig } from "../lib/config";

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="shell footer-grid">
        <div>
          <p className="eyebrow">{tenantConfig.brand.logoText}</p>
          <h2>Exceptional cars. Clearly presented.</h2>
        </div>
        <div>
          <p className="footer-label">Studios</p>
          {activeDealership.locations.map((location) => (
            <p key={location.id}>
              {location.name} · {location.city}
            </p>
          ))}
        </div>
        <div>
          <p className="footer-label">Contact</p>
          <p>
            <a href={"tel:" + tenantConfig.contact.phone}>
              {tenantConfig.contact.phone}
            </a>
          </p>
          <p>
            <a href={"mailto:" + tenantConfig.contact.email}>
              {tenantConfig.contact.email}
            </a>
          </p>
          <Link href="/contact">Send an enquiry</Link>
        </div>
      </div>
      <div className="shell footer-bottom">
        <span>Powered by VandLabs Automobile Engine</span>
        <span>Reference dealership · <Link href="/download">Download the workspace ↗</Link></span>
      </div>
      <div className="shell design-credits">Interaction inspiration: <a href="https://skiper-ui.com/v1/skiper40">Skiper UI</a> · <a href="https://21st.dev/">21st.dev</a></div>
    </footer>
  );
}
