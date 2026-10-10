import Link from "next/link";
import { tenantConfig } from "../lib/config";
import { PrimaryNav } from "./primary-nav";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell nav">
        <Link className="brand" href="/">
          <span className="brand-symbol" aria-hidden="true">A</span> {tenantConfig.brand.logoText}
        </Link>
        <PrimaryNav items={[...tenantConfig.navigation, { href: "/download", label: "Desktop app" }]} />
        <a className="nav-call" href={"tel:" + tenantConfig.contact.phone}>
          Call studio
        </a>
      </div>
    </header>
  );
}
