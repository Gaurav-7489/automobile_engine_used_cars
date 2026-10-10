"use client";
import { useState } from "react";

export function ShareLink({ path, label = "Copy link" }: { path?: string; label?: string }) {
  const [status, setStatus] = useState("");
  const [fallback, setFallback] = useState("");
  async function copy() {
    const url = path ? new URL(path, window.location.origin).href : window.location.href;
    try { await navigator.clipboard.writeText(url); setStatus("Link copied"); setFallback(""); }
    catch { setStatus("Copy this link manually"); setFallback(url); }
  }
  return <div className="share-control"><button type="button" className="button compact" onClick={copy}>{label} <span aria-hidden="true">↗</span></button><span role="status" className="meta">{status}</span>{fallback && <input aria-label="Shareable link" readOnly value={fallback} onFocus={e => e.currentTarget.select()} />}</div>;
}
