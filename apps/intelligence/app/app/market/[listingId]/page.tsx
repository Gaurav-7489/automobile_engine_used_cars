import type { Metadata } from "next";
import { ListingDetail } from "@/components/market/listing-detail";
import { MarketGate } from "@/components/market/market-gate";

export const metadata: Metadata = { title: "Vehicle intelligence" };

export default async function Page({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  return <MarketGate title="Vehicle intelligence"><ListingDetail id={listingId} /></MarketGate>;
}
