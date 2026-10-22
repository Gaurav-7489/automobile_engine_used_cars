import type { Metadata } from "next";
import { LeadsPage } from "@/components/leads/leads-page";

export const metadata: Metadata = { title: "Lead" };

export default async function Page({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  return <LeadsPage leadId={leadId} />;
}
