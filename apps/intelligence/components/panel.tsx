"use client";

import type { ReactNode } from "react";
import { requiredRoleText, type Capability } from "@/lib/permissions";
import { ErrorPanel, PanelSkeleton } from "./ui";
import { useUrlState, useWorkspace } from "./workspace";
import type { Remote } from "./use-remote";

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

/**
 * A panel backed by a remote read: skeleton on first load, a recoverable error with Retry when nothing is on screen, the previous
 * result (marked busy) while a newer one loads, and the QA demo states for review.
 */
export function RemotePanel<T>({ title, remote, rows = 3, children }: { title: string; remote: Remote<T>; rows?: number; children: ReactNode }) {
  const { demoState } = useWorkspace();
  const url = useUrlState();
  if (demoState === "loading" || (remote.status === "loading" && !remote.data)) return <PanelSkeleton rows={rows} title={title} />;
  if (demoState === "error" || (remote.status === "error" && !remote.data)) {
    return <ErrorPanel title={`${title} could not load`} onRetry={demoState === "error" ? () => url.set({ demo_state: null }) : remote.reload} />;
  }
  return (
    <div aria-busy={remote.status === "refreshing"} style={{ opacity: remote.status === "refreshing" ? 0.72 : 1, transition: "opacity 120ms ease" }}>
      {remote.status === "error" ? <div className="notice danger" role="alert" style={{ marginBottom: 12 }}>{remote.error} <button className="link-btn" onClick={remote.reload}>Retry</button></div> : null}
      {children}
    </div>
  );
}
