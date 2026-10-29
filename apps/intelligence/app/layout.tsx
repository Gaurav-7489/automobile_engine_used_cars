import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MotionRoot } from "@/components/motion/motion";
import { MOTION_INIT_SCRIPT, THEME_INIT_SCRIPT } from "@/lib/init-scripts";

export const metadata: Metadata = {
  title: { default: "VandLabs Automotive Intelligence", template: "%s | VandLabs" },
  description: "Market evidence, inventory operations and vehicle-specific advertising for Indian dealerships, in one workspace.",
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "VandLabs Auto", statusBarStyle: "default" },
  icons: { apple: "/app-icons/icon-192.png" },
};

export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0b0e0d" }, { media: "(prefers-color-scheme: light)", color: "#f3f5f4" }], width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT + MOTION_INIT_SCRIPT }} /></head>
      <body>
        <div className="ambient" aria-hidden="true"><i /><i /><i /></div>
        <MotionRoot />
        <a className="skip-link" href="#content">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
