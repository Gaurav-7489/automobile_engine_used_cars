import Link from "next/link";
import { tenantConfig } from "../lib/config";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell nav">
        <Link className="brand" href="/">
          {tenantConfig.brand.logoText}
        </Link>
        <nav aria-label="Primary">
          {tenantConfig.navigation.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <a className="nav-call" href={"tel:" + tenantConfig.contact.phone}>
          Call studio
        </a>
      </div>
    </header>
  );
}
