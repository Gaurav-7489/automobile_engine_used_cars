import type { Metadata } from "next";
import { JoinExperience } from "@/components/login/join-experience";
import { ssoProviders } from "@/lib/server/federated";

export const metadata: Metadata = { title: "Set your password", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <JoinExperience token={token} google={ssoProviders().length > 0} />;
}
