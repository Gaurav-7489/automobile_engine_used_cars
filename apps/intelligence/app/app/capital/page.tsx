import type { Metadata } from "next";
import { CapitalPage } from "@/components/capital/capital-page";

export const metadata: Metadata = { title: "Capital and profit" };

export default function Page() {
  return <CapitalPage />;
}
