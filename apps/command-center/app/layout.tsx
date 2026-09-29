import "./globals.css";
import Link from "next/link";
import { tenantConfig } from "@vandlabs/demo-data";

const nav = [
  ["Overview", "/"],
  ["Leads", "/leads"],
  ["Pipeline", "/pipeline"],
  ["Tasks", "/tasks"],
  ["Appointments", "/appointments"],
  ["Inventory", "/inventory"],
  ["Customers", "/customers"],
  ["Analytics", "/analytics"],
  ["Settings", "/settings"],
] as const;

export const metadata = {
  title: "Command Center | VandLabs Automobile Engine",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <aside className="sidebar">
            <div>
              <strong className="wordmark">{tenantConfig.brand.logoText}</strong>
              <p className="muted">Dealership Command Center</p>
            </div>
            <nav aria-label="Command Center">
              {nav.map(([label, href]) => (
                <Link key={href} href={href}>
                  {label}
                </Link>
              ))}
            </nav>
            <div className="sidebar-foot">
              <span className="status-dot" />
              Demo tenant · healthy
            </div>
          </aside>
          <div className="app-content">
            <nav className="mobile-nav" aria-label="Command Center mobile">
              {nav.map(([label, href]) => (
                <Link key={href} href={href}>
                  {label}
                </Link>
              ))}
            </nav>
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
