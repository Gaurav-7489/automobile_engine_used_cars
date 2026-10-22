import type { Metadata } from "next";
import { RegionsPage } from "@/components/market/regions-page";

export const metadata: Metadata = { title: "Regional price comparison" };

export default function Page() {
  return <RegionsPage />;
}
