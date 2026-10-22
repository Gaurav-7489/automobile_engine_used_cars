import type { Metadata } from "next";
import { AdvertisingPage } from "@/components/advertising/advertising-page";

export const metadata: Metadata = { title: "Campaign" };

export default async function Page({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  return <AdvertisingPage campaignId={campaignId} />;
}
