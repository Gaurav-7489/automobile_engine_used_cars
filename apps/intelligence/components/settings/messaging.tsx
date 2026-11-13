"use client";

import { useState } from "react";
import type { ChannelState } from "@/lib/server/channels";
import { useRemote } from "../use-remote";
import { useToast } from "../toast";
import { Badge, Button, Notice, PanelSkeleton, PasswordField, TextField } from "../ui";

type Data = { channels: ChannelState[]; aiReady: boolean; metaReady: boolean; webhookUrl: string; canManage: boolean };

const HELP: Record<string, string> = {
  website: "A chat button on your public car pages. It answers from your published cars and passes customers to your team.",
  whatsapp: "Your WhatsApp Business number through Meta's WhatsApp Cloud API. Customers who message it become leads.",
  instagram: "Direct messages to your Instagram professional account.",
};

/** Settings → Customer messaging: which channels the AI agent answers on. Each one is off until switched on here. */
export function Messaging() {
  const remote = useRemote<Data>("/api/settings/messaging");
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ externalId: "", token: "", password: "" });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const save = async (channel: string, enabled: boolean, details = false) => {
    setBusy(channel); setError("");
    try {
      if (details && form.token) {
        const r = await fetch("/api/auth/reauth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: form.password }) });
        if (!r.ok) { const b = await r.json().catch(() => ({})); setError(b?.error?.message ?? "Password not confirmed."); setBusy(""); return; }
      }
      const r = await fetch("/api/settings/messaging", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channel, enabled, ...(details ? { externalId: form.externalId, token: form.token || undefined } : {}) }) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setError(b?.error?.message ?? "Could not save."); setBusy(""); return; }
      toast(enabled ? "Switched on." : "Switched off.");
      setEditing(null); setForm({ externalId: "", token: "", password: "" });
      remote.reload();
    } catch { setError("We could not reach the server."); }
    setBusy("");
  };

  if (!remote.data) return <PanelSkeleton rows={4} title="Customer messaging" />;
  const d = remote.data;
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div>
        <h2 className="h3">Customer messaging</h2>
        <p className="muted">Where the AI assistant answers customers. It replies only from your published car records, never negotiates price, finance or bookings, and hands customers to your team when a person is needed. Every conversation is in Conversations.</p>
      </div>
      {!d.aiReady ? <Notice tone="warn" role="status">The AI key is not set for this workspace yet. Customers still get an acknowledgement, and every message goes to your team in Conversations.</Notice> : null}
      {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
      <div className="ad-accounts">
        {d.channels.map((c) => (
          <div key={c.channel} className="ad-account" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 280px" }}>
              <strong>{c.label}</strong>
              <span className="meta">{c.enabled && c.displayName ? c.displayName : HELP[c.channel]}</span>
              {editing === c.channel ? (
                <div className="stack-sm mt-2">
                  <TextField label={c.channel === "whatsapp" ? "Phone number ID" : "Instagram account ID"} inputMode="numeric" value={form.externalId} onChange={(e) => setForm({ ...form, externalId: e.target.value.trim() })} help={c.channel === "whatsapp" ? "Meta Business Manager → WhatsApp → API setup." : "Instagram professional account ID linked to your Facebook Page."} />
                  <PasswordField label="Access token" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} help="A permanent system-user token. Stored encrypted." />
                  <PasswordField label="Your VandLabs password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} help="Needed to save a token." />
                  <p className="meta">In your Meta app, set the webhook to <code>{d.webhookUrl}</code> and subscribe to {c.channel === "whatsapp" ? "messages" : "Instagram messages"}.</p>
                  <div className="row-flex"><Button variant="primary" size="sm" loading={busy === c.channel} disabled={!form.externalId || !form.token || !form.password} onClick={() => save(c.channel, true, true)}>Check and switch on</Button><Button size="sm" onClick={() => setEditing(null)}>Cancel</Button></div>
                </div>
              ) : null}
            </div>
            <div className="row-flex">
              {c.enabled ? <Badge tone="accent">On</Badge> : <Badge>Off</Badge>}
              {d.canManage && editing !== c.channel ? (
                c.channel === "website" || c.configured
                  ? <Button size="sm" variant={c.enabled ? "ghost" : "primary"} loading={busy === c.channel} onClick={() => save(c.channel, !c.enabled)}>{c.enabled ? "Switch off" : "Switch on"}</Button>
                  : d.metaReady ? <Button size="sm" variant="primary" onClick={() => { setEditing(c.channel); setForm({ externalId: c.externalId, token: "", password: "" }); }}>Connect</Button> : <span className="meta">Not available yet</span>
              ) : null}
              {d.canManage && c.channel !== "website" && c.configured && editing !== c.channel ? <Button size="sm" variant="ghost" onClick={() => { setEditing(c.channel); setForm({ externalId: c.externalId, token: "", password: "" }); }}>Change</Button> : null}
            </div>
          </div>
        ))}
      </div>
      {!d.canManage ? <p className="meta">Only an owner or manager can change these.</p> : null}
      {!d.metaReady ? <p className="meta">WhatsApp and Instagram become available once VandLabs enables Meta messaging for this deployment.</p> : null}
      <p className="meta">AI voice calls are being tested and are not available yet.</p>
    </div>
  );
}
