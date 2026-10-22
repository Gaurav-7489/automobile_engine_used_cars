import type { Metadata } from "next";
import { MarketPage } from "@/components/market/market-page";

export const metadata: Metadata = { title: "Market Radar" };

export default function Page() {
  return <MarketPage />;
}
