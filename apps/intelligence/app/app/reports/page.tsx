import type { Metadata } from "next";
import { ReportsPage } from "@/components/reports/reports-page";

export const metadata: Metadata = { title: "Reports and analytics" };

export default function Page() {
  return <ReportsPage />;
}
