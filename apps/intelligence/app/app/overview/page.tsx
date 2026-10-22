import type { Metadata } from "next";
import { OverviewPage } from "@/components/overview/overview-page";

export const metadata: Metadata = { title: "Command Centre" };

export default function Page() {
  return <OverviewPage />;
}
