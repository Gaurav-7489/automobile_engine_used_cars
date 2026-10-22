import type { Metadata } from "next";
import { AdvertisingPage } from "@/components/advertising/advertising-page";

export const metadata: Metadata = { title: "Advertising Studio" };

export default function Page() {
  return <AdvertisingPage />;
}
