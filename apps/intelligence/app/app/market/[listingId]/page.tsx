import type { Metadata } from "next";
import { ListingDetail } from "@/components/market/listing-detail";

export const metadata: Metadata = { title: "Vehicle intelligence" };

export default async function Page({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  return <ListingDetail id={listingId} />;
}
