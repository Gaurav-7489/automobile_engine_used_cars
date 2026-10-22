import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "VandLabs Automotive Intelligence", template: "%s | VandLabs" },
  description: "Market evidence, inventory operations and vehicle-specific advertising for Indian dealerships, in one workspace.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#0a0d14", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>
        <a className="skip-link" href="#content">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
