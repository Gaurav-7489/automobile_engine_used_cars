import Link from "next/link";
import { tenantConfig } from "../lib/config";
import { PrimaryNav } from "./primary-nav";

export function SiteHeader() {
  const navigation = tenantConfig.navigation.filter(item => item.href !== "/contact");
  return (
    <header className="site-header">
      <div className="shell nav">
        <Link className="brand" href="/">
          <svg className="brand-symbol" viewBox="0 0 32 28" aria-hidden="true">
            <defs><linearGradient id="brand-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff6a3d" /><stop offset="1" stopColor="#f2210f" /></linearGradient></defs>
            <path d="M3 25 L13 4 h5 L8 25z M11 25 L18.5 10 h5 L16 25z M19 25 L24 15 h5 L24 25z" fill="url(#brand-red)" />
          </svg>
          {tenantConfig.brand.logoText}
        </Link>
        <PrimaryNav items={[{ href: "/", label: "Home" }, { href: "/dealer", label: "Services" }, ...navigation, { href: "/download", label: "Desktop app" }]} />
        <Link className="nav-call" href="/contact">Contact</Link>
      </div>
    </header>
  );
}
