import Link from "next/link";
import { PrimaryNav } from "./primary-nav";

/** Original VandLabs Auto mark: a split chevron — the road ahead, in two strokes. */
export function BrandMark({ id = "vl-mark" }: { id?: string }) {
  return <svg className="brand-mark" viewBox="0 0 34 28" aria-hidden="true">
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff5a3c" /><stop offset="1" stopColor="#df2417" /></linearGradient></defs>
    <path d="M1.5 3h8.2l7.6 16.4-3.9 7.6z" fill={`url(#${id})`} />
    <path d="M20.2 3h12.3L22.6 21.7l-4.3-9.4 4.4-9.3z" fill="currentColor" />
  </svg>;
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell nav">
        <Link className="brand" href="/" aria-label="VandLabs Auto home"><BrandMark /><span>VandLabs <b>Auto</b></span></Link>
        <PrimaryNav items={[{ href: "/", label: "Home" }, { href: "/discover", label: "Discover" }, { href: "/saved", label: "Saved Cars" }]} />
        <Link className="nav-call" href="/contact">Contact</Link>
      </div>
    </header>
  );
}
