import type { Metadata } from "next";
import { MarketGate } from "@/components/market/market-gate";
import { MarketPage } from "@/components/market/market-page";

export const metadata: Metadata = { title: "Market Radar" };

export default function Page() {
  return <MarketGate title="Market Radar"><MarketPage /></MarketGate>;
}
