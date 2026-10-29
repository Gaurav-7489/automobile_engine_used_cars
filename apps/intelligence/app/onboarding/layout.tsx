import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/server/auth";
import { buildShell } from "@/lib/server/shell";
import { LiveEffects } from "@/components/live-effects";
import { ToastProvider } from "@/components/toast";
import { WorkspaceProvider } from "@/components/workspace";

export const dynamic = "force-dynamic";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const current = await getPrincipal();
  if (!current) redirect("/login?returnTo=/onboarding");
  const state = await buildShell(current.principal, current.session);
  return (
    <WorkspaceProvider session={current.session} initialState={state} asOf={new Date().toISOString()}>
      <ToastProvider><LiveEffects />{children}</ToastProvider>
    </WorkspaceProvider>
  );
}
