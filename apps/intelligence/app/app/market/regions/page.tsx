import type { Metadata } from "next";
import { MarketGate } from "@/components/market/market-gate";
import { RegionsPage } from "@/components/market/regions-page";

export const metadata: Metadata = { title: "Regional price comparison" };

export default function Page() {
  return <MarketGate title="Regional price comparison"><RegionsPage /></MarketGate>;
}
