import "./globals.css";
import { ShortlistProvider } from "../components/shortlist";
import { PageMotion } from "../components/page-motion";
import { dealershipService } from "../lib/services";
import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";
import { JourneyCapture } from "../components/journey-capture";
import { tenantConfig } from "../lib/config";

import { isReadOnlyPreview } from "../lib/hosting";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: process.env.NEXT_PUBLIC_PREVIEW_READ_ONLY === "true" ? { index: false, follow: false } : undefined,
  metadataBase: new URL(tenantConfig.seo.canonicalBase),
  title: {
    default: tenantConfig.seo.title + " | Powered by VandLabs",
    template: "%s | " + tenantConfig.seo.title,
  },
  description: tenantConfig.seo.description,
  openGraph: {
    title: tenantConfig.seo.title,
    description: tenantConfig.seo.description,
    type: "website",
  },
};

export default async function Layout({ children }: { children: React.ReactNode }) {
  const inventory = await dealershipService.inventory();
  const catalog = inventory.map(({ id, slug, make, model, year, price, availabilityStatus }) => ({ id, slug, make, model, year, price, availabilityStatus }));
  return (
    <html lang="en">
      <body>
        <ShortlistProvider catalog={catalog} scope={tenantConfig.tenantId + ":" + tenantConfig.activeDealershipId}>
        <PageMotion />
        <Suspense fallback={null}>
          {!isReadOnlyPreview() && <JourneyCapture />}
        </Suspense>
        <SiteHeader />
        {isReadOnlyPreview() && <div role="status" className="preview-notice">Reference dealership preview — browse sample vehicles. Enquiries and staff operations require the connected backend.</div>}
        {children}
        <SiteFooter />
        </ShortlistProvider>
      </body>
    </html>
  );
}
