"use client";

import { useEffect } from "react";
import type { StepUpResult } from "@/lib/step-up-copy";

/** Tells the window that opened this one how it ended. A success closes this window; a failure stays open so the reason can be read. */
export function CloseWhenConfirmed({ result }: { result: StepUpResult }) {
  useEffect(() => {
    try { window.opener?.postMessage({ type: "vl-reauth", ok: result === "ok", result }, window.location.origin); } catch { /* opener gone */ }
    if (result !== "ok") return;
    const t = setTimeout(() => window.close(), 600);
    return () => clearTimeout(t);
  }, [result]);
  return null;
}
