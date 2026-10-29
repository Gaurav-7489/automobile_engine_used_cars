import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/server/auth";
import { buildShell } from "@/lib/server/shell";
import { isPlatformAdmin } from "@/lib/server/platform-admin";
import { Shell } from "@/components/shell";
import { WorkspaceProvider } from "@/components/workspace";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const current = await getPrincipal();
  if (!current) redirect("/login");
  let state;
  let platformAdmin = false;
  try {
    // Independent reads run together, so the page waits for the slower one rather than both.
    const [shell, admin] = await Promise.all([buildShell(current.principal, current.session), isPlatformAdmin(current.principal.userId)]);
    state = shell;
    platformAdmin = admin;
  } catch (error) {
    console.error(JSON.stringify({ event: "workspace_render_failure", message: error instanceof Error ? error.message : "unknown" }));
    return (
      <main className="login-form-wrap" id="content" tabIndex={-1}>
        <div className="login-form"><h1 className="h1">Your workspace is unavailable</h1><p className="muted">We could not load your data. Nothing was changed. Reload in a moment; if this continues, contact support.</p></div>
      </main>
    );
  }
  return (
    <WorkspaceProvider session={current.session} initialState={state} asOf={new Date().toISOString()}>
      <Shell platformAdmin={platformAdmin}>{children}</Shell>
    </WorkspaceProvider>
  );
}
