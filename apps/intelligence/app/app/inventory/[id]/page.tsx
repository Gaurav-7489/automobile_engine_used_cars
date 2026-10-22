import type { Metadata } from "next";
import { StockDetail } from "@/components/inventory/stock-detail";

export const metadata: Metadata = { title: "Stock record" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StockDetail id={id} />;
}
