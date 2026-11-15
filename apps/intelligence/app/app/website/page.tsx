import type { Metadata } from "next";
import { WebsitePerformancePage } from "@/components/reports/website-performance";

export const metadata: Metadata = { title: "Website performance" };

export default function Page() {
  return <WebsitePerformancePage />;
}
