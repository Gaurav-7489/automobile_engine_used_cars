import type { Metadata } from "next";
import { StockIntelligencePage } from "@/components/stock/stock-intelligence-page";

export const metadata: Metadata = { title: "Stock ageing" };

export default function Page() {
  return <StockIntelligencePage />;
}
