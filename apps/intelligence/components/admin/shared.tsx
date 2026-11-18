"use client";

import { Notice, PasswordField } from "../ui";
import { useEffect, useState } from "react";
import { confirmWithGoogle, stepUp, stepUpStatus, type StepUpTarget } from "@/lib/step-up";

export type Problem = { error?: { code?: string; message?: string; fields?: Record<string, string> } };

export async function call<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T & Problem }> {
  try {
    const r = await fetch(url, { ...init, headers: init?.body ? { "content-type": "application/json" } : undefined });
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  } catch {
    return { ok: false, data: { error: { message: "We could not reach the server. Try again." } } as T & Problem };
  }
}

/**
 * Step-up confirmation for one sensitive change. Every change has its own confirmation (one action, one resource, used once), so
 * `confirm(password, target)` always asks again. `needsPassword` is true only for a legacy password session (LEGACY_PASSWORD_LOGIN=enabled),
 * where the dialog shows a password field.
 */
export function useReauth() {
  const [needsPassword, setNeedsPassword] = useState(false);
  useEffect(() => {
    let live = true;
    void stepUpStatus().then((s) => { if (live) setNeedsPassword(s.method === "password"); });
    return () => { live = false; };
  }, []);
  /** Returns an error message, or null once this change is confirmed. Google's window opens synchronously, inside the click. */
  const confirm = (password: string, target: StepUpTarget): Promise<string | null> => (needsPassword ? stepUp(password || undefined, target) : confirmWithGoogle(target));
  /** Call when the server says the confirmation was missing or used. */
  const expired = () => { void stepUpStatus().then((s) => setNeedsPassword(s.method === "password")); };
  return { needsPassword, confirm, expired };
}

/** What a sensitive dialog shows about confirming identity: a password field (legacy sessions only) or the Google step. */
export function ConfirmIdentity({ needsPassword, password, onPassword, error }: { needsPassword: boolean; password: string; onPassword: (v: string) => void; error?: string }) {
  if (needsPassword) return <PasswordField label="Confirm your password" value={password} onChange={(e) => onPassword(e.target.value)} autoComplete="current-password" error={error} />;
  return (
    <div className="stack-sm">
      <Notice>Google will ask you to confirm it&apos;s you in a small window before this change is made.</Notice>
      {error ? <div className="field-error" role="alert">{error}</div> : null}
    </div>
  );
}
