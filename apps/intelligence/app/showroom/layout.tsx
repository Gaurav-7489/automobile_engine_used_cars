import Link from "next/link";
import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme";
import { SAMPLE_NOTICE } from "@/lib/showroom";

export const metadata: Metadata = { title: { default: "Showroom", template: "%s | VandLabs Showroom" }, description: "Browse the VandLabs sample showroom." };

export default function ShowroomLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="showroom">
      <div className="ambient" aria-hidden="true" />
      <header className="sr-header">
        <Link href="/showroom" className="sr-brand" aria-label="VandLabs showroom home"><Brand sub={false} /></Link>
        <nav aria-label="Showroom" className="sr-nav">
          <Link href="/showroom">Home</Link>
          <Link href="/showroom/inventory">Inventory</Link>
        </nav>
        <ThemeToggle />
        <Link href="/login" className="btn btn-primary">Dealer sign in</Link>
      </header>
      <div role="note" className="sr-notice">{SAMPLE_NOTICE}</div>
      <main id="content" tabIndex={-1} className="sr-main">{children}</main>
      <footer className="sr-footer">
        <span className="meta">VandLabs Automotive Intelligence</span>
        <span><Link href="/info/privacy">Privacy</Link> / <Link href="/info/terms">Terms</Link> / <Link href="/info/support">Support</Link></span>
      </footer>
    </div>
  );
}
