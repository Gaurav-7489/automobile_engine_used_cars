import type { Metadata } from "next";
import { StockIntelligencePage } from "@/components/stock/stock-intelligence-page";

export const metadata: Metadata = { title: "Stock intelligence" };

export default function Page() {
  return <StockIntelligencePage />;
}
