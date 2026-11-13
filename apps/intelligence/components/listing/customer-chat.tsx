"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { id: string; at: string; from: "customer" | "ai" | "team"; text: string };

const VISITOR_KEY = "vl_chat_visitor";

function visitorToken(): string {
  try {
    const saved = window.localStorage.getItem(VISITOR_KEY);
    if (saved && /^[A-Za-z0-9_-]{24,64}$/.test(saved)) return saved;
    const fresh = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
    window.localStorage.setItem(VISITOR_KEY, fresh);
    return fresh;
  } catch {
    return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
  }
}

/** "Ask about this car": answers from the dealer's own listings, and passes the customer to the team when a person is needed. */
export function CustomerChat({ tenant, stock, dealer, title }: { tenant: string; stock?: string; dealer: string; title?: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const visitor = useRef("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { visitor.current = visitorToken(); }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages, open]);
  // While open, pick up replies the team sends from VandLabs.
  useEffect(() => {
    if (!open) return;
    const load = () => fetch(`/api/public/chat?tenant=${tenant}&visitor=${visitor.current}`).then((r) => r.json()).then((b) => { if (Array.isArray(b.messages)) setMessages(b.messages); }).catch(() => undefined);
    void load();
    const t = window.setInterval(load, 8000);
    return () => window.clearInterval(t);
  }, [open, tenant]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true); setError(""); setDraft("");
    setMessages((m) => [...m, { id: `local-${Date.now()}`, at: new Date().toISOString(), from: "customer", text }]);
    try {
      const r = await fetch("/api/public/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenant, stock, visitor: visitor.current, text }) });
      const b = await r.json().catch(() => ({}));
      if (r.ok && Array.isArray(b.messages)) setMessages(b.messages); else setError(b?.error?.message ?? "Message not sent. Please try again.");
    } catch { setError("Message not sent. Check your connection."); }
    setBusy(false);
  }

  if (!open) return <button type="button" className="cc-launch" onClick={() => setOpen(true)} aria-haspopup="dialog">{title ? "Ask about this car" : "Ask us"}</button>;
  return (
    <section className="cc-panel" role="dialog" aria-label={`Chat with ${dealer || "the dealership"}`}>
      <header className="cc-head">
        <div><strong>{dealer || "Dealership"}</strong><span>AI assistant · our team can take over</span></div>
        <button type="button" className="cc-close" onClick={() => setOpen(false)} aria-label="Close chat">×</button>
      </header>
      <div className="cc-log" role="log" aria-live="polite">
        {messages.length === 0 ? <p className="cc-hint">{title ? `Ask anything about the ${title}: availability, fuel, kilometres, or a call back from the team.` : "Ask about any of our cars, or ask for a call back."}</p> : null}
        {messages.map((m) => <div key={m.id} className={`cc-msg cc-${m.from}`}>{m.from === "team" ? <span className="cc-by">Team</span> : null}{m.text}</div>)}
        {busy ? <div className="cc-msg cc-ai cc-typing" aria-label="Replying"><i /><i /><i /></div> : null}
        <div ref={end} />
      </div>
      {error ? <p className="cc-error" role="alert">{error}</p> : null}
      <form className="cc-form" onSubmit={send}>
        <label className="sr-only" htmlFor="cc-input">Message</label>
        <input id="cc-input" className="input" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={1000} placeholder="Type your question" autoComplete="off" />
        <button type="submit" className="btn btn-primary" disabled={!draft.trim() || busy}>Send</button>
      </form>
      <p className="cc-note">Answers come from this dealer&apos;s listings. Prices, finance and bookings are confirmed by the team.</p>
    </section>
  );
}
