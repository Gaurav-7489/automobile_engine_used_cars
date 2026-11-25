"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../icons";
import { useRemote } from "../use-remote";
import { Button, EmptyState, Notice, PageHead } from "../ui";

type Message = { role: "user" | "assistant"; content: string };

const STARTERS: { topic: string; text: string }[] = [
  { topic: "stock_overview", text: "Which cars have been in stock too long?" },
  { topic: "state_prices", text: "Where is a Hyundai Creta priced highest?" },
  { topic: "lead_overview", text: "How are my leads doing this month?" },
  { topic: "find_cars", text: "Write an Instagram post for my newest car" },
  { topic: "search_help", text: "How do I connect WhatsApp?" },
];

type Info = {
  configured: boolean; topics: string[]; provider?: "gemini" | "anthropic"; model?: string; availability?: string; problem?: string;
  lastCall?: { status: "ok" | "error"; errorKind: string | null; at: string } | null; threads?: { id: string; title: string; updatedAt: string }[];
};

const PROVIDER: Record<string, string> = { gemini: "Google Gemini", anthropic: "Anthropic Claude" };
/** What a failed availability check or last call means for the person using the assistant. */
const PROBLEM: Record<string, string> = {
  invalid_key: "The AI service rejected this workspace's key. Answers will fail until VandLabs fixes the setup.",
  model_unavailable: "The configured AI model is not available. Answers will fail until VandLabs changes the setup.",
  quota_exhausted: "Today's AI usage limit has been reached. The assistant will be available again tomorrow.",
  rate_limited: "The AI service is busy. Answers may be slow or fail; try again in a moment.",
  busy: "The AI service is busy. Answers may be slow or fail; try again in a moment.",
  network: "The AI service could not be reached on the last check. Answers may fail.",
  timeout: "The AI service was slow to respond on the last check. Answers may fail.",
};

/** The assistant conversation, used by the panel on every page and by the full Assistant page. Conversations are saved for the member who had them. */
export function AssistantChat({ compact = false }: { compact?: boolean }) {
  const info = useRemote<Info>("/api/assistant");
  const pathname = usePathname();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const thread = useRef<string | null>(null);
  const restored = useRef(false);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages]);
  useEffect(() => () => abort.current?.abort(), []);
  // Pick up where the member left off: the most recent saved conversation is loaded once.
  const latest = info.data?.threads?.[0]?.id;
  useEffect(() => {
    if (restored.current || !latest) return;
    restored.current = true;
    fetch(`/api/assistant/threads/${latest}`).then((r) => (r.ok ? r.json() : null)).then((body: { messages?: Message[] } | null) => {
      if (body?.messages?.length && !thread.current) { thread.current = latest; setMessages((now) => (now.length ? now : body.messages!)); }
    }).catch(() => undefined);
  }, [latest]);

  function reset() { abort.current?.abort(); thread.current = null; restored.current = true; setMessages([]); setBusy(false); }

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
      const response = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: history.slice(-20), page: pathname, threadId: thread.current ?? undefined }), signal: controller.signal });
      thread.current = response.headers.get("X-Assistant-Thread") || thread.current;
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
  const issue = info.data?.availability && info.data.availability !== "ok" && info.data.availability !== "unchecked" ? info.data.availability
    : info.data?.lastCall?.status === "error" ? info.data.lastCall.errorKind ?? "" : "";
  const source = info.data?.provider ? `Answers by ${PROVIDER[info.data.provider] ?? info.data.provider}${info.data.model ? ` (${info.data.model})` : ""}.` : "";
  const starters = STARTERS.filter((s) => !info.data || info.data.topics.includes(s.topic));
  return (
    <div className={compact ? "assistant compact" : "page assistant"}>
      {compact ? (messages.length ? <div className="spread"><span className="meta">Knows your stock, leads, money and how VandLabs works</span><Button size="sm" variant="ghost" onClick={reset}>New chat</Button></div> : null) : (
        <PageHead title="Assistant" lead="Ask about your stock, leads, sales, prices or how to do anything in VandLabs."
          actions={messages.length ? <Button onClick={reset}>New chat</Button> : undefined} />
      )}
      {off ? <EmptyState title="The assistant is not set up yet">It needs an AI provider and key set up by VandLabs for this workspace.{info.data?.problem ? ` (${info.data.problem})` : ""} Everything else keeps working.</EmptyState> : (
        <>
          {issue && PROBLEM[issue] ? <Notice tone="warn" role="status">{PROBLEM[issue]}</Notice> : null}
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
          <p className="meta">Reads your records and the VandLabs guide; it cannot change anything, never sees customer contact details, and never shares passwords or keys. {source}</p>
        </>
      )}
    </div>
  );
}
