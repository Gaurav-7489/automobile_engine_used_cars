import type { Metadata } from "next";
import { PricingPage } from "@/components/pricing/pricing-page";

export const metadata: Metadata = { title: "Price request" };

export default async function Page({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  return <PricingPage requestId={requestId} />;
}
