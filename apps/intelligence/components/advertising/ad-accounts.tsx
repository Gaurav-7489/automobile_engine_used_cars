"use client";

import { useEffect, useState } from "react";
import type { AdAccountStatus } from "@/lib/server/ad-accounts";
import { useRemote } from "../use-remote";
import { useToast } from "../toast";
import { Badge, Button, Notice } from "../ui";
import { useUrlState, useWorkspace } from "../workspace";

const NOTICE: Record<string, string> = {
  connected: "Connected. You can now publish ads there.",
  cancelled: "Connection cancelled. Nothing was changed.",
  forbidden: "Only an owner or manager can connect an advertising account.",
  unavailable: "That connection is not set up for this workspace yet. Ask VandLabs to enable it.",
  failed: "The connection did not finish.",
  unknown: "Unknown provider.",
};

/** Google Ads and Facebook/Instagram, one row each: connect once, then every approved campaign can publish there. */
export function AdAccounts() {
  const { refresh } = useWorkspace();
  const url = useUrlState();
  const toast = useToast();
  const remote = useRemote<{ accounts: AdAccountStatus[]; canManage: boolean }>("/api/advertising/accounts");
  const [busy, setBusy] = useState("");
  const flag = url.get("ads");
  const reason = url.get("reason");
  useEffect(() => { if (flag === "connected") void refresh(); }, [flag, refresh]);

  const post = async (provider: string, action: "disconnect" | "choose", accountId?: string) => {
    setBusy(provider);
    const r = await fetch("/api/advertising/accounts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, action, accountId }) }).catch(() => null);
    setBusy("");
    if (!r?.ok) { toast("That did not work. Try again.", "error"); return; }
    toast(action === "disconnect" ? "Disconnected. Stored access was deleted." : "Ad account changed.");
    remote.reload();
    void refresh();
  };

  if (!remote.data) return null;
  const { accounts, canManage } = remote.data;
  return (
    <section className="ad-accounts" aria-label="Ad accounts">
      {flag && NOTICE[flag] ? <Notice tone={flag === "connected" ? "accent" : "warn"} role="status">{NOTICE[flag]}{flag === "failed" && reason ? ` ${reason}` : ""}</Notice> : null}
      {accounts.map((a) => (
        <div key={a.provider} className="ad-account">
          <div>
            <strong>{a.name}</strong>
            <span className="meta">{a.connected ? (a.needsReconnect ? "Access expired. Connect again to keep publishing." : a.accountName) : a.covers}</span>
          </div>
          <div className="row-flex">
            {a.connected && a.accounts.length > 1 && canManage ? (
              <select className="select" aria-label={`${a.name} account`} value={a.accountId} disabled={busy === a.provider} onChange={(e) => post(a.provider, "choose", e.target.value)} style={{ width: "auto" }}>
                {a.accounts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            ) : null}
            {a.connected && !a.needsReconnect ? <Badge tone="accent">Connected</Badge> : null}
            {canManage && a.available && (!a.connected || a.needsReconnect) ? <a className="btn btn-primary btn-sm" href={`/api/advertising/accounts/${a.provider}`}>Connect</a> : null}
            {canManage && a.connected ? <Button size="sm" variant="ghost" loading={busy === a.provider} onClick={() => post(a.provider, "disconnect")}>Disconnect</Button> : null}
            {!a.available && !a.connected ? <span className="meta">Not available yet</span> : null}
            {a.available && !a.connected && !canManage ? <span className="meta">An owner or manager can connect it</span> : null}
          </div>
        </div>
      ))}
    </section>
  );
}
