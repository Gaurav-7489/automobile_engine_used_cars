"use client";

import type { ReactNode } from "react";
import { requiredRoleText, type Capability } from "@/lib/permissions";
import { ErrorPanel, PanelSkeleton } from "./ui";
import { useUrlState, useWorkspace } from "./workspace";

/**
 * Each panel can load, fail and recover independently. QA states are driven by ?demo_state=loading|error|partial|empty:
 * loading shows skeletons, error fails every panel with Retry, partial fails only panels marked `partialFail`.
 */
export function Panel({ title, children, rows = 3, partialFail }: { title: string; children: ReactNode; rows?: number; partialFail?: boolean }) {
  const { demoState } = useWorkspace();
  const url = useUrlState();
  if (demoState === "loading") return <PanelSkeleton rows={rows} title={title} />;
  if (demoState === "error" || (demoState === "partial" && partialFail)) {
    return <ErrorPanel title={`${title} could not load`} partial={demoState === "partial"} onRetry={() => url.set({ demo_state: null })} />;
  }
  return <>{children}</>;
}

export function Gate({ capability, children, title = "You do not have access to this area" }: { capability: Capability; children: ReactNode; title?: string }) {
  const { can, session } = useWorkspace();
  if (can(capability)) return <>{children}</>;
  return (
    <div className="state-box" role="alert">
      <h1 className="h2" id="page-title" tabIndex={-1}>{title}</h1>
      <p className="muted">{requiredRoleText(capability)} You are signed in as {session.role}. Ask a workspace owner to change your role if you need this area. Nothing about the configuration is shown here.</p>
    </div>
  );
}
