import { redirect } from "next/navigation";
import { currentSession } from "@/lib/api";
import { ToastProvider } from "@/components/toast";
import { WorkspaceProvider } from "@/components/workspace";

export const dynamic = "force-dynamic";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/login?returnTo=/onboarding");
  return <WorkspaceProvider session={session}><ToastProvider>{children}</ToastProvider></WorkspaceProvider>;
}
