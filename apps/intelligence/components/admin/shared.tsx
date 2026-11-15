"use client";

import { Notice, PasswordField } from "../ui";
import { useEffect, useState } from "react";
import { confirmWithGoogle, stepUp, stepUpStatus, type StepUpMethod } from "@/lib/step-up";

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
 * Step-up confirmation shared by every sensitive dialog. With Google sign-in, `confirm()` opens Google's confirmation window;
 * `needsPassword` is true only for a legacy password session (LEGACY_PASSWORD_LOGIN=enabled), where the dialog shows a password field.
 */
export function useReauth() {
  const [needsPassword, setNeedsPassword] = useState(false);
  const [known, setKnown] = useState<{ valid: boolean; method: StepUpMethod } | null>(null);
  useEffect(() => {
    let live = true;
    void stepUpStatus().then((s) => { if (live) { setKnown(s); setNeedsPassword(!s.valid && s.method === "password"); } });
    return () => { live = false; };
  }, []);
  /** Returns an error message, or null once the account is confirmed. */
  const confirm = (password: string): Promise<string | null> => {
    // Known to need Google: open its window synchronously, inside the click, so pop-up blockers allow it.
    const pending = known && !known.valid && known.method === "google" ? confirmWithGoogle() : stepUp(password || undefined);
    return pending.then((failed) => { if (!failed) { setNeedsPassword(false); setKnown({ valid: true, method: known?.method ?? "google" }); } return failed; });
  };
  /** Call when the server says the confirmation lapsed between the check and the change. */
  const expired = () => { void stepUpStatus().then((s) => { setKnown(s); setNeedsPassword(!s.valid && s.method === "password"); }); };
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
