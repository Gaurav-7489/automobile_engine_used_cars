import type { Metadata } from "next";
import { InvestorsPage } from "@/components/investors/investors-page";

export const metadata: Metadata = { title: "Investors" };

export default function Page() {
  return <InvestorsPage />;
}
