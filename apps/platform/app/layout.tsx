import "./globals.css";
import Link from "next/link";

const nav = [
  ["Overview", "/"],
  ["Dealerships", "/dealerships"],
  ["Organizations", "/organizations"],
  ["Onboarding", "/onboarding"],
  ["Health", "/health"],
  ["Integrations", "/integrations"],
  ["Features", "/features"],
  ["Audit", "/audit"],
] as const;

export const metadata = {
  title: "Platform Control Center | VandLabs",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="platform-shell">
          <header className="platform-header">
            <div>
              <strong>VANDLABS · AUTOMOBILE ENGINE</strong>
              <span>Platform Control Center</span>
            </div>
            <span className="environment">REFERENCE · V1 MVP</span>
          </header>
          <nav className="nav" aria-label="Platform navigation">
            {nav.map(([label, href]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </nav><form action="/platform/auth/logout" method="post"><button type="submit">Sign out</button></form>
          {children}
        </div>
      </body>
    </html>
  );
}
