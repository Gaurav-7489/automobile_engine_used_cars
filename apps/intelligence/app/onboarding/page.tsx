import type { Metadata } from "next";
import { Onboarding } from "@/components/onboarding/onboarding";

export const metadata: Metadata = { title: "Workspace setup" };

export default function Page() {
  return <Onboarding />;
}
