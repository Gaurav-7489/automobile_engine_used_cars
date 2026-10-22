import { redirect } from "next/navigation";
import { currentSession } from "@/lib/api";
import { Shell } from "@/components/shell";
import { WorkspaceProvider } from "@/components/workspace";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/login");
  return (
    <WorkspaceProvider session={session}>
      <Shell>{children}</Shell>
    </WorkspaceProvider>
  );
}
