import type { Metadata } from "next";
import { JoinExperience } from "@/components/login/join-experience";
import { legacyPasswordLogin } from "@/lib/server/legacy-auth";

export const metadata: Metadata = { title: "Your access", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <JoinExperience token={token} legacy={legacyPasswordLogin()} />;
}
