"use client";

import { useEffect } from "react";

export function CloseWhenConfirmed({ ok }: { ok: boolean }) {
  useEffect(() => {
    if (!ok) return;
    try { window.opener?.postMessage({ type: "vl-reauth", ok: true }, window.location.origin); } catch { /* opener gone */ }
    const t = setTimeout(() => window.close(), 600);
    return () => clearTimeout(t);
  }, [ok]);
  return null;
}
