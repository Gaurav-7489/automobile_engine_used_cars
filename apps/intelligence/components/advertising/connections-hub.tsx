"use client";

import { useEffect, useState } from "react";
import type { PlatformId, PlatformStatus } from "@/lib/server/connections";
import { useRemote } from "../use-remote";
import { useToast } from "../toast";
import { Button, Notice } from "../ui";
import { useUrlState, useWorkspace } from "../workspace";

const NOTICE: Record<string, string> = {
  connected: "Connected. Your cars can now be promoted there.",
  cancelled: "Connection cancelled. Nothing was changed.",
  forbidden: "Only an owner or manager can connect accounts.",
  unavailable: "That connection is not switched on for this workspace yet. Ask VandLabs to enable it.",
  failed: "The connection did not finish.",
  unknown: "Unknown platform.",
};

/** A small mark per platform, drawn here (no third-party images or scripts). */
export function PlatformMark({ id, size = 36 }: { id: PlatformId; size?: number }) {
  const glyph: Record<PlatformId, React.ReactNode> = {
    instagram: <><rect x="6" y="6" width="20" height="20" rx="6" fill="none" stroke="#fff" strokeWidth="2.4" /><circle cx="16" cy="16" r="4.6" fill="none" stroke="#fff" strokeWidth="2.4" /><circle cx="21.6" cy="10.4" r="1.5" fill="#fff" /></>,
    facebook: <path d="M17.6 26v-8.2h2.8l.4-3.2h-3.2v-2c0-.9.3-1.6 1.6-1.6h1.7V8.1c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.4h-2.8v3.2h2.8V26z" fill="#fff" />,
    whatsapp: <><path d="M16 6.5a9.5 9.5 0 0 0-8.2 14.3L6.5 25.5l4.8-1.3A9.5 9.5 0 1 0 16 6.5z" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" /><path d="M12.6 12.2c.3-.6.6-.6.9-.6h.6c.2 0 .5 0 .7.5l.9 2.1c.1.2.1.4 0 .6l-.5.7c-.1.2-.2.3 0 .6.5.9 1.9 2.2 3 2.6.2.1.4.1.5-.1l.7-.8c.2-.2.4-.2.6-.1l2 .9c.2.1.4.2.4.4 0 .6-.3 1.5-1 1.9-.7.4-1.8.6-3.6-.2-2.5-1.1-4.1-3.7-4.3-4-.2-.3-1-1.4-1-2.7 0-.9.4-1.5.7-1.8z" fill="#fff" /></>,
    google: <><path d="M25 16.2c0-.7-.1-1.3-.2-1.9H16v3.6h5.1a4.4 4.4 0 0 1-1.9 2.9v2.4h3.1c1.8-1.7 2.7-4.1 2.7-7z" fill="#fff" /><path d="M16 25.5c2.6 0 4.7-.8 6.3-2.3l-3.1-2.4c-.8.6-1.9.9-3.2.9-2.5 0-4.6-1.7-5.3-3.9H7.5v2.5a9.5 9.5 0 0 0 8.5 5.2z" fill="#fff" opacity=".85" /><path d="M10.7 17.8a5.7 5.7 0 0 1 0-3.6v-2.5H7.5a9.5 9.5 0 0 0 0 8.6z" fill="#fff" opacity=".7" /><path d="M16 10.3c1.4 0 2.6.5 3.6 1.4l2.7-2.7A9.5 9.5 0 0 0 7.5 11.7l3.2 2.5c.7-2.2 2.8-3.9 5.3-3.9z" fill="#fff" opacity=".9" /></>,
    youtube: <><rect x="5" y="9" width="22" height="14" rx="4.5" fill="none" stroke="#fff" strokeWidth="2.2" /><path d="M14 12.6v6.8l5.8-3.4z" fill="#fff" /></>,
  };
  return <span className={`pf-mark pf-${id}`} style={{ width: size, height: size }} aria-hidden="true"><svg viewBox="0 0 32 32" width={size * 0.72} height={size * 0.72}>{glyph[id]}</svg></span>;
}

export type Platforms = { platforms: PlatformStatus[]; canManage: boolean };

/** Loads the five platforms once for the page; the hub and the Promote sheet read the same answer. */
export function usePlatforms() {
  const { state } = useWorkspace();
  return useRemote<Platforms>(state.live ? "/api/advertising/accounts" : null);
}

/**
 * Instagram, Facebook, WhatsApp, Google Ads and YouTube in one row of cards. Each connects on the platform's own sign-in
 * screen, once; cards that share a login (Facebook and Instagram, Google Ads and YouTube) connect together.
 */
export function ConnectionsHub({ remote }: { remote: ReturnType<typeof usePlatforms> }) {
  const { state, refresh } = useWorkspace();
  const url = useUrlState();
  const toast = useToast();
  const [busy, setBusy] = useState("");
  const flag = url.get("ads");
  const reason = url.get("reason");
  useEffect(() => { if (flag === "connected") void refresh(); }, [flag, refresh]);

  const disconnect = async (p: PlatformStatus) => {
    const provider = p.via;
    if (!window.confirm(`Disconnect ${p.viaName}? ${provider === "meta" ? "Facebook and Instagram" : provider === "google" ? "Google Ads and YouTube" : "WhatsApp"} will stop working until you connect again. Stored access is deleted.`)) return;
    setBusy(provider);
    const r = await fetch("/api/advertising/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, action: "disconnect" }) }).catch(() => null);
    setBusy("");
    if (!r?.ok) { toast("That did not work. Try again.", "error"); return; }
    toast("Disconnected. Stored access was deleted.");
    remote.reload();
    void refresh();
  };

  if (!state.live) {
    return (
      <section className="pf-hub" aria-label="Connected accounts">
        {(["instagram", "facebook", "whatsapp", "google", "youtube"] as PlatformId[]).map((id) => (
          <div key={id} className="pf-card"><PlatformMark id={id} /><div className="pf-body"><strong>{{ instagram: "Instagram", facebook: "Facebook", whatsapp: "WhatsApp", google: "Google Ads", youtube: "YouTube" }[id]}</strong><span className="meta">Sample workspace: connect in your live workspace</span></div></div>
        ))}
      </section>
    );
  }
  if (!remote.data) return <section className="pf-hub" role="status" aria-busy="true" aria-label="Loading connected accounts">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="pf-card pf-card-hold" />)}</section>;
  const { platforms, canManage } = remote.data;
  const connected = platforms.filter((p) => p.connected).length;
  return (
    <section className="stack-sm" aria-labelledby="pf-title">
      <div className="spread"><h2 className="h3" id="pf-title">Your accounts</h2><span className="meta">{connected} of {platforms.length} connected</span></div>
      {flag && NOTICE[flag] ? <Notice tone={flag === "connected" ? "accent" : "warn"} role="status">{NOTICE[flag]}{flag === "failed" && reason ? ` ${reason}` : ""}</Notice> : null}
      <div className="pf-hub">
        {platforms.map((p) => (
          <div key={p.id} className={`pf-card ${p.connected ? "is-on" : ""}`}>
            <PlatformMark id={p.id} />
            <div className="pf-body">
              <strong>{p.name}</strong>
              <span className="meta">{p.connected ? (p.needsReconnect ? "Access expired. Connect again." : p.account || "Connected") : p.problem || p.does}</span>
              {!p.connected && p.available && (p.id === "instagram" || p.id === "youtube") ? <span className="pf-via meta">Uses your {p.viaName}</span> : null}
            </div>
            <div className="pf-action">
              {p.connected && !p.needsReconnect ? <span className="pf-on"><span aria-hidden="true">●</span> Connected</span> : null}
              {canManage && p.available && (!p.connected || p.needsReconnect) ? <a className="btn btn-primary btn-sm" href={`/api/advertising/accounts/${p.via}`}>{p.problem ? "Reconnect" : "Connect"}</a> : null}
              {canManage && p.connected ? <Button size="sm" variant="ghost" loading={busy === p.via} onClick={() => disconnect(p)} aria-label={`Disconnect ${p.name}`}>Disconnect</Button> : null}
              {!p.available && !p.connected ? <span className="meta">Not switched on yet</span> : null}
              {p.available && !p.connected && !canManage ? <span className="meta">An owner or manager connects this</span> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
