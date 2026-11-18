"use client";

import { isStepUpResult, STEP_UP_MESSAGES } from "./step-up-copy";

/**
 * Step-up confirmation before a sensitive change. With Google sign-in, a small window asks Google to confirm it's you
 * (re-authenticating unless you did in the last few minutes); the server checks it is the Google account bound to this session
 * and grants a 10-minute confirmation. The dialog that asked keeps its state.
 */
export type StepUpMethod = "google" | "password";

export async function stepUpStatus(): Promise<{ valid: boolean; method: StepUpMethod }> {
  try {
    const r = await fetch("/api/auth/reauth", { cache: "no-store" });
    const b = (await r.json()) as { valid?: boolean; method?: StepUpMethod };
    return { valid: b.valid === true, method: b.method === "password" ? "password" : "google" };
  } catch {
    return { valid: false, method: "google" };
  }
}

let pending: Promise<string | null> | null = null;

/**
 * Opens Google confirmation. Call it directly inside a click handler (before any await) so pop-up blockers allow the window.
 * Only one confirmation window runs at a time: a second request while one is open waits for the same result.
 */
export function confirmWithGoogle(): Promise<string | null> {
  if (pending) return pending;
  const popup = window.open("/api/auth/sso/google?intent=reauth", "vl-reauth", "popup,width=480,height=640");
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
    const check = async () => { if ((await stepUpStatus()).valid) finish(null); };
    // The confirmation window reports its outcome; a failure shows its reason, a success is verified on the server.
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; ok?: boolean; result?: unknown } | null;
      if (data?.type !== "vl-reauth") return;
      if (data.ok) void check();
      else finish(isStepUpResult(data.result) ? STEP_UP_MESSAGES[data.result] : STEP_UP_MESSAGES.failed);
    };
    window.addEventListener("message", onMessage);
    // Local check only (no network): notice the window being closed by the person.
    const closedTimer = setInterval(() => {
      if (Date.now() - started > 3 * 60_000) { finish("Confirmation timed out. Try again."); return; }
      if (popup.closed) void stepUpStatus().then((s) => finish(s.valid ? null : "Google confirmation was not completed."));
    }, 1000);
    // Fallback for browsers that sever window.opener on Google's pages: check the server every few seconds, not every second.
    const pollTimer = setInterval(() => { void check(); }, 4000);
  });
  return pending;
}

/** Returns null once confirmed, or a message to show. `password` is used only for legacy password sessions. */
export async function stepUp(password?: string): Promise<string | null> {
  const status = await stepUpStatus();
  if (status.valid) return null;
  if (status.method === "google") return confirmWithGoogle();
  if (!password) return "Enter your password to continue.";
  try {
    const r = await fetch("/api/auth/reauth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    if (r.ok) return null;
    const b = await r.json().catch(() => ({}));
    return b?.error?.message ?? "We could not confirm it's you. Try again.";
  } catch {
    return "We could not reach the server. Try again.";
  }
}
