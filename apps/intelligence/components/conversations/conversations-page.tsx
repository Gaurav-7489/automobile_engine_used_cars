"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ChannelState } from "@/lib/server/channels";
import type { Conversation } from "@/lib/server/conversations";
import { formatDateTime } from "@/lib/format";
import { useRemote } from "../use-remote";
import { useToast } from "../toast";
import { Badge, Button, EmptyState, ErrorPanel, PageHead, PanelSkeleton, Tabs } from "../ui";
import { useScopedHref, useUrlState, useWorkspace } from "../workspace";

const LABEL = { website: "Website chat", whatsapp: "WhatsApp", instagram: "Instagram" } as const;
const STATUS = { ai: { label: "AI replying", tone: "accent" }, team: { label: "Team", tone: "warn" }, closed: { label: "Closed", tone: "neutral" } } as const;

/** Every customer conversation in one list. Open one to read it, reply on the customer's channel, or take it over from the AI. */
export function ConversationsPage() {
  const { can } = useWorkspace();
  const url = useUrlState();
  const href = useScopedHref();
  const toast = useToast();
  const filter = url.get("status", "all");
  const remote = useRemote<{ conversations: Conversation[]; channels: ChannelState[] }>(`/api/conversations?status=${filter}`);
  const [openId, setOpenId] = useState(url.get("c", ""));
  const [local, setLocal] = useState<Record<string, Conversation>>({});
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { const t = window.setInterval(remote.reload, 15_000); return () => window.clearInterval(t); }, [remote.reload]);

  const list = (remote.data?.conversations ?? []).map((c) => local[c.id] && local[c.id].updatedAt >= c.updatedAt ? local[c.id] : c);
  const conv = list.find((c) => c.id === openId) ?? null;
  const anyOn = remote.data?.channels.some((c) => c.enabled);

  const act = async (action: string, text?: string) => {
    if (!conv) return;
    setBusy(true);
    const r = await fetch(`/api/conversations/${conv.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, text }) }).catch(() => null);
    const body = await r?.json().catch(() => null);
    setBusy(false);
    if (!r?.ok) { toast(body?.error?.message ?? "That did not work. Try again.", "error"); return false; }
    if (body?.conversation) setLocal((m) => ({ ...m, [conv.id]: body.conversation }));
    remote.reload();
    return true;
  };
  const choose = (id: string) => { setOpenId(id); url.set({ c: id }); const c = list.find((x) => x.id === id); if (c?.unread) void fetch(`/api/conversations/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "read" }) }); };

  if (!remote.data && remote.status !== "error") return <div className="page"><PageHead title="Conversations" /><PanelSkeleton rows={6} /></div>;
  if (!remote.data) return <div className="page"><PageHead title="Conversations" /><ErrorPanel title="Conversations could not load" onRetry={remote.reload} /></div>;

  return (
    <div className="page">
      <PageHead title="Conversations" lead="Customer messages from your website, WhatsApp and Instagram." />
      {!anyOn ? (
        <EmptyState title="No customer channels are switched on" actions={can("settings.view") ? <Link className="btn btn-primary" href={href("/app/settings/messaging")}>Set up channels</Link> : undefined}>
          Switch on the website chat, WhatsApp or Instagram in Settings. The AI answers customers from your published cars and passes them to your team when a person is needed.
        </EmptyState>
      ) : null}
      <Tabs label="Conversation status" idPrefix="cv" value={filter} onChange={(v) => url.set({ status: v === "all" ? null : v })} tabs={[{ value: "all", label: "All" }, { value: "team", label: "Needs the team" }, { value: "ai", label: "AI replying" }, { value: "closed", label: "Closed" }]} />
      <div className="conv-layout">
        <ul className="conv-list" aria-label="Conversations">
          {list.length === 0 ? <li className="meta conv-empty">No conversations yet.</li> : null}
          {list.map((c) => (
            <li key={c.id}>
              <button type="button" className={`conv-item${c.id === openId ? " on" : ""}`} onClick={() => choose(c.id)} aria-current={c.id === openId ? "true" : undefined}>
                <span className="spread"><strong>{c.contactName || LABEL[c.channel] + " customer"}</strong>{c.unread ? <span className="conv-dot" aria-label="Unread" /> : null}</span>
                <span className="meta">{LABEL[c.channel]}{c.vehicleStockId ? ` · ${c.vehicleStockId}` : ""} · {formatDateTime(c.updatedAt)}</span>
                <span className="conv-last">{c.messages.at(-1)?.text ?? ""}</span>
                <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
              </button>
            </li>
          ))}
        </ul>
        <section className="card conv-thread" aria-label="Conversation">
          {!conv ? <p className="muted">Choose a conversation to read it.</p> : (
            <>
              <div className="spread conv-thread-head">
                <div>
                  <h2 className="h3">{conv.contactName || `${LABEL[conv.channel]} customer`}</h2>
                  <span className="meta">{[LABEL[conv.channel], conv.contactPhone, conv.vehicleStockId ? `Car ${conv.vehicleStockId}` : ""].filter(Boolean).join(" · ")}</span>
                </div>
                <div className="row-flex">
                  {conv.leadId ? <Link className="btn btn-sm" href={href(`/app/leads/${conv.leadId}`)}>Lead {conv.leadId}</Link> : can("leads.edit") ? <Button size="sm" loading={busy} onClick={() => act("lead")}>Add as lead</Button> : null}
                  {conv.status === "ai" && can("leads.contact") ? <Button size="sm" onClick={() => act("take")}>Take over</Button> : null}
                  {conv.status === "team" && can("leads.contact") ? <Button size="sm" variant="ghost" onClick={() => act("return")}>Let AI reply</Button> : null}
                  {conv.status !== "closed" && can("leads.contact") ? <Button size="sm" variant="ghost" onClick={() => act("close")}>Close</Button> : null}
                </div>
              </div>
              <div className="conv-messages" role="log">
                {conv.messages.map((m) => (
                  <div key={m.id} className={`conv-msg conv-${m.from}`}>
                    <span className="meta">{m.from === "customer" ? "Customer" : m.from === "ai" ? "AI assistant" : m.by || "Team"} · {formatDateTime(m.at)}</span>
                    <p>{m.text}</p>
                  </div>
                ))}
              </div>
              {can("leads.contact") && conv.status !== "closed" ? (
                <form className="chat-form" onSubmit={async (e) => { e.preventDefault(); if (reply.trim() && (await act("reply", reply.trim()))) setReply(""); }}>
                  <label className="sr-only" htmlFor="conv-reply">Reply</label>
                  <textarea id="conv-reply" className="input chat-input" rows={1} maxLength={1000} placeholder={`Reply on ${LABEL[conv.channel]}`} value={reply} onChange={(e) => setReply(e.target.value)} />
                  <Button type="submit" variant="primary" loading={busy} disabled={!reply.trim()}>Send</Button>
                </form>
              ) : null}
              <p className="meta">Replying takes the conversation over from the AI until you choose “Let AI reply”.</p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
