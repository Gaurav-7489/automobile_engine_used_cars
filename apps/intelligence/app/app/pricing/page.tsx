import type { Metadata } from "next";
import { PricingPage } from "@/components/pricing/pricing-page";

export const metadata: Metadata = { title: "Pricing intelligence" };

export default function Page() {
  return <PricingPage />;
}
