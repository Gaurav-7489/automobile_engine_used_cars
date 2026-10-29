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
        <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}><defs><filter id="goo" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" /><feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" result="goo" /><feComposite in="SourceGraphic" in2="goo" operator="atop" /></filter></defs></svg>
        <MotionRoot />
        <a className="skip-link" href="#content">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
