import "./globals.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";
import { JourneyCapture } from "../components/journey-capture";
import { tenantConfig } from "../lib/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
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

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={null}>
          <JourneyCapture />
        </Suspense>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
