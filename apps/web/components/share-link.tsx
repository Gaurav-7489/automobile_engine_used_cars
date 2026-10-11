"use client";
import { useEffect, useRef, useState } from "react";

export function ShareLink({ path, label = "Copy link" }: { path?: string; label?: string }) {
  const [status, setStatus] = useState("");
  const [fallback, setFallback] = useState("");
  const requestId = useRef(0);
  useEffect(() => { requestId.current++; setStatus(""); setFallback(""); }, [path]);
  async function copy() {
    const request = ++requestId.current;
    const url = path ? new URL(path, window.location.origin).href : window.location.href;
    try { await navigator.clipboard.writeText(url); if (request !== requestId.current) return; setStatus("Link copied"); setFallback(""); }
    catch { if (request !== requestId.current) return; setStatus("Copy this link manually"); setFallback(url); }
  }
  return <div className="share-control"><button type="button" className="button compact" onClick={copy}>{label} <span aria-hidden="true">↗</span></button><span role="status" className="meta">{status}</span>{fallback && <input aria-label="Shareable link" readOnly value={fallback} onFocus={e => e.currentTarget.select()} />}</div>;
}
