import type { Metadata } from "next";
import { StatePricesPage } from "@/components/state-prices/state-prices-page";

export const metadata: Metadata = { title: "Prices by state" };

export default function Page() {
  return <StatePricesPage />;
}
