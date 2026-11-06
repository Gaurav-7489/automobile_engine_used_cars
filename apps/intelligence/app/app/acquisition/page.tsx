import type { Metadata } from "next";
import { AcquisitionPage } from "@/components/acquisition/acquisition-page";

export const metadata: Metadata = { title: "Buying" };

export default function Page() {
  return <AcquisitionPage />;
}
