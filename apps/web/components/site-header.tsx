import Link from "next/link";
import { tenantConfig } from "../lib/config";
import { RollingLink } from "./rolling-link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell nav">
        <Link className="brand" href="/">
          <span className="brand-symbol" aria-hidden="true">A</span> {tenantConfig.brand.logoText}
        </Link>
        <nav aria-label="Primary">
          {tenantConfig.navigation.map((item) => (
            <RollingLink key={item.href} href={item.href}>
              {item.label}
            </RollingLink>
          ))}
          <RollingLink href="/download">Desktop app</RollingLink>
        </nav>
        <a className="nav-call" href={"tel:" + tenantConfig.contact.phone}>
          Call studio
        </a>
      </div>
    </header>
  );
}
