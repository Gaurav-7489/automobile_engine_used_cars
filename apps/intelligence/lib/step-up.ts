"use client";

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

/** Opens Google confirmation. Call it directly inside a click handler (before any await) so pop-up blockers allow the window. */
export function confirmWithGoogle(): Promise<string | null> {
  const popup = window.open("/api/auth/sso/google?intent=reauth", "vl-reauth", "popup,width=480,height=640");
  if (!popup) return Promise.resolve("Allow pop-ups for this site, then try again. Google opens a small window to confirm it's you.");
  const started = Date.now();
  return new Promise((resolve) => {
    const finish = (value: string | null) => { clearInterval(timer); window.removeEventListener("message", onMessage); resolve(value); };
    const check = async () => { if ((await stepUpStatus()).valid) finish(null); };
    const onMessage = (e: MessageEvent) => { if (e.origin === window.location.origin && (e.data as { type?: string })?.type === "vl-reauth") void check(); };
    window.addEventListener("message", onMessage);
    const timer = setInterval(() => {
      if (Date.now() - started > 3 * 60_000) { finish("Confirmation timed out. Try again."); return; }
      if (popup.closed) void stepUpStatus().then((s) => finish(s.valid ? null : "Google confirmation was not completed."));
      else void check();
    }, 1200);
  });
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
