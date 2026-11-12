"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../icons";
import { useRemote } from "../use-remote";
import { Button, EmptyState, PageHead } from "../ui";

type Message = { role: "user" | "assistant"; content: string };

const STARTERS: { topic: string; text: string }[] = [
  { topic: "stock_overview", text: "Which cars have been in stock too long?" },
  { topic: "state_prices", text: "Where is a Hyundai Creta priced highest?" },
  { topic: "lead_overview", text: "How are my leads doing this month?" },
  { topic: "find_cars", text: "Write an Instagram post for my newest car" },
];

/** A plain conversation: ask about the dealership in your own words. Nothing is saved; a reload starts fresh. */
export function AssistantPage() {
  const info = useRemote<{ configured: boolean; topics: string[] }>("/api/assistant");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages]);
  useEffect(() => () => abort.current?.abort(), []);

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const history: Message[] = [...messages, { role: "user", content: question }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setDraft("");
    setBusy(true);
    const write = (content: string) => setMessages([...history, { role: "assistant", content }]);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: history.slice(-20) }), signal: controller.signal });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        write(body?.error?.message ?? "The assistant could not answer that. Try again.");
      } else {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let answer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          answer += decoder.decode(value, { stream: true });
          write(answer);
        }
        if (!answer.trim()) write("The assistant could not answer that. Try again.");
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") write("We could not reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  const off = info.data && !info.data.configured;
  const starters = STARTERS.filter((s) => !info.data || info.data.topics.includes(s.topic));
  return (
    <div className="page assistant">
      <PageHead title="Assistant" lead="Ask about your stock, leads, sales and prices in your own words."
        actions={messages.length ? <Button onClick={() => { abort.current?.abort(); setMessages([]); setBusy(false); }}>New chat</Button> : undefined} />
      {off ? <EmptyState title="The assistant is not set up yet">It needs an AI key added by VandLabs for this workspace. Everything else keeps working.</EmptyState> : (
        <>
          <div className="chat" role="log" aria-live="polite" aria-label="Conversation">
            {messages.length === 0 ? (
              <div className="chat-start">
                <p className="muted">Try one of these, or type your own question.</p>
                <div className="chat-starters">{starters.map((s) => <button key={s.text} type="button" className="chat-starter" onClick={() => ask(s.text)}>{s.text}</button>)}</div>
              </div>
            ) : messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                {m.content ? m.content : <span className="chat-wait" aria-label="Thinking"><i /><i /><i /></span>}
              </div>
            ))}
            <div ref={end} />
          </div>
          <form className="chat-form" onSubmit={(e) => { e.preventDefault(); ask(draft); }}>
            <label className="sr-only" htmlFor="chat-input">Your question</label>
            <textarea id="chat-input" className="input chat-input" rows={1} maxLength={4000} placeholder="Ask anything about your dealership" value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(draft); } }} />
            <Button type="submit" variant="primary" disabled={!draft.trim() || busy} aria-label="Send"><Icon name="arrowRight" size={18} /></Button>
          </form>
          <p className="meta">Answers come from your own records and published prices. The assistant reads only; it cannot change anything, and customer contact details are never shared with it.</p>
        </>
      )}
    </div>
  );
}
