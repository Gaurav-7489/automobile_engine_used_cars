import "./globals.css";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ShortlistProvider } from "../components/shortlist";
import { SavedProvider } from "../components/saved";
import { PageMotion } from "../components/page-motion";
import { dealershipService } from "../lib/services";
import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";
import { JourneyCapture } from "../components/journey-capture";
import { tenantConfig } from "../lib/config";

import { isReadOnlyPreview } from "../lib/hosting";

export const dynamic = "force-dynamic";

// Self-hosted at build time: no runtime request to a font CDN.
const sans = Plus_Jakarta_Sans({ subsets: ["latin"], display: "swap", variable: "--font-sans" });

export const viewport: Viewport = { themeColor: "#ffffff", width: "device-width", initialScale: 1, viewportFit: "cover" };

export const metadata: Metadata = {
  robots: { index: process.env.SEO_INDEXABLE !== "false", follow: true },
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION },
  twitter: { card: "summary_large_image" },
  metadataBase: new URL(tenantConfig.seo.canonicalBase),
  title: {
    default: "VandLabs Auto · AI used car discovery",
    template: "%s | VandLabs Auto",
  },
  description: tenantConfig.seo.description,
  applicationName: "VandLabs Auto",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "VandLabs Auto", statusBarStyle: "default" },
  icons: { apple: "/app-icons/icon-192.png" },
  openGraph: {
    title: "VandLabs Auto",
    description: tenantConfig.seo.description,
    type: "website",
    siteName: "VandLabs Auto",
  },
};

export default async function Layout({ children }: { children: React.ReactNode }) {
  const inventory = await dealershipService.inventory();
  const catalog = inventory.map(({ id, slug, make, model, year, price, availabilityStatus }) => ({ id, slug, make, model, year, price, availabilityStatus }));
  const scope = tenantConfig.tenantId + ":" + tenantConfig.activeDealershipId;
  return (
    <html lang="en-IN" className={sans.variable}>
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        <SavedProvider catalog={catalog} scope={scope}>
        <ShortlistProvider catalog={catalog} scope={scope}>
        <PageMotion />
        <Suspense fallback={null}>
          {!isReadOnlyPreview() && <JourneyCapture />}
        </Suspense>
        <SiteHeader />
        {isReadOnlyPreview() && <div role="status" className="preview-notice">Reference showroom preview — browse sample cars. Enquiries and staff operations need the connected backend.</div>}
        <div id="main-content" tabIndex={-1}>{children}</div>
        <SiteFooter />
        </ShortlistProvider>
        </SavedProvider>
      </body>
    </html>
  );
}
