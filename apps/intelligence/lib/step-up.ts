"use client";

import type { StepUpAction } from "./step-up-actions";
import { isStepUpResult, STEP_UP_MESSAGES, type StepUpResult } from "./step-up-copy";

/**
 * Step-up confirmation before one sensitive change. The confirmation is for that change only: a small Google window asks the person
 * to sign in again, the server checks it and records one confirmation for this action and resource, and the change uses it once.
 */
export type StepUpMethod = "google" | "password";
export type StepUpTarget = { action: StepUpAction; resource?: string };
export type StepUpConfirmation = { action: string; resource: string; expiresIn: number } | null;

export async function stepUpStatus(): Promise<{ method: StepUpMethod; lastResult: StepUpResult | null; confirmation: StepUpConfirmation }> {
  try {
    const r = await fetch("/api/auth/reauth", { cache: "no-store" });
    const b = (await r.json()) as { method?: StepUpMethod; lastResult?: unknown; confirmation?: StepUpConfirmation };
    return { method: b.method === "password" ? "password" : "google", lastResult: isStepUpResult(b.lastResult) ? b.lastResult : null, confirmation: b.confirmation ?? null };
  } catch {
    return { method: "google", lastResult: null, confirmation: null };
  }
}

/** Whether the server holds a confirmation for exactly this action and resource. */
const holds = (c: StepUpConfirmation, t: StepUpTarget) => c !== null && c.action === t.action && c.resource === (t.resource ?? "");

let pending: Promise<string | null> | null = null;

/**
 * Opens Google's confirmation window for one change. Call it directly inside a click handler (before any await) so pop-up blockers allow
 * the window. Only one window runs at a time: a second request while one is open waits for the same result.
 */
export function confirmWithGoogle(target: StepUpTarget): Promise<string | null> {
  if (pending) return pending;
  const query = new URLSearchParams({ intent: "reauth", action: target.action, resource: target.resource ?? "" });
  const popup = window.open(`/api/auth/sso/google?${query.toString()}`, "vl-reauth", "popup,width=480,height=640");
  if (!popup) return Promise.resolve("Allow pop-ups for this site, then try again. Google opens a small window to confirm it's you.");
  const started = Date.now();
  pending = new Promise<string | null>((resolve) => {
    const finish = (value: string | null) => {
      clearInterval(closedTimer);
      clearInterval(pollTimer);
      window.removeEventListener("message", onMessage);
      pending = null;
      resolve(value);
    };
    const check = async () => { if (holds((await stepUpStatus()).confirmation, target)) finish(null); };
    // The confirmation window reports its outcome; a failure shows a generic reason, success is verified on the server.
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; ok?: boolean; result?: unknown } | null;
      if (data?.type !== "vl-reauth") return;
      if (data.ok) void check();
      else finish(isStepUpResult(data.result) ? STEP_UP_MESSAGES[data.result] : STEP_UP_MESSAGES.failed);
    };
    window.addEventListener("message", onMessage);
    // Local timing only (no network): notice the window being closed by the person.
    const closedTimer = setInterval(() => {
      if (Date.now() - started > 3 * 60_000) { finish("Confirmation timed out. Try again."); return; }
      if (popup.closed) {
        void stepUpStatus().then((s) => finish(holds(s.confirmation, target) ? null : s.lastResult ? STEP_UP_MESSAGES[s.lastResult] : "Google confirmation was not completed."));
      }
    }, 1000);
    // Fallback for browsers that sever window.opener on Google's pages: check the server every few seconds, not every second.
    const pollTimer = setInterval(() => { void check(); }, 4000);
  });
  return pending;
}

/**
 * Returns null once this change is confirmed, or a message to show. `password` is used only for legacy password sessions
 * (LEGACY_PASSWORD_LOGIN=enabled), where the confirmation is issued for the same action and resource.
 */
export async function stepUp(password: string | undefined, target: StepUpTarget): Promise<string | null> {
  const status = await stepUpStatus();
  if (status.method === "google") return confirmWithGoogle(target);
  if (!password) return "Enter your password to continue.";
  try {
    const r = await fetch("/api/auth/reauth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password, action: target.action, resource: target.resource ?? "" }) });
    if (r.ok) return null;
    const b = await r.json().catch(() => ({}));
    return b?.error?.message ?? "We could not confirm it's you. Try again.";
  } catch {
    return "We could not reach the server. Try again.";
  }
}
