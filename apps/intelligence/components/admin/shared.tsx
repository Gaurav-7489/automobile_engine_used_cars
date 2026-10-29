"use client";

import { useEffect, useState } from "react";

export type Problem = { error?: { code?: string; message?: string; fields?: Record<string, string> } };

export async function call<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T & Problem }> {
  try {
    const r = await fetch(url, { ...init, headers: init?.body ? { "content-type": "application/json" } : undefined });
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  } catch {
    return { ok: false, data: { error: { message: "We could not reach the server. Try again." } } as T & Problem };
  }
}

/** Password confirmation shared by every sensitive dialog: the field only appears when no valid confirmation is held. */
export function useReauth() {
  const [needsPassword, setNeedsPassword] = useState(true);
  useEffect(() => {
    let live = true;
    void call<{ valid?: boolean }>("/api/auth/reauth").then((r) => { if (live && r.ok && r.data.valid) setNeedsPassword(false); });
    return () => { live = false; };
  }, []);
  /** Returns an error message, or null once the account is confirmed. */
  const confirm = async (password: string): Promise<string | null> => {
    if (!needsPassword) return null;
    if (!password) return "Enter your password to continue.";
    const r = await call<object>("/api/auth/reauth", { method: "POST", body: JSON.stringify({ password }) });
    if (r.ok) { setNeedsPassword(false); return null; }
    return r.data.error?.message ?? "We could not confirm your password. Try again.";
  };
  /** Call when the server says the confirmation lapsed between the check and the change. */
  const expired = () => setNeedsPassword(true);
  return { needsPassword, confirm, expired };
}

