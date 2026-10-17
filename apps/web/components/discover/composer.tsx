"use client";

import Form from "next/form";
import { useEffect, useRef, useState } from "react";

const sparkle = <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" fill="currentColor" /></svg>;

/** Plain GET form: works before hydration, and each turn becomes a history entry. */
export function Composer({ turns = [], examples = [], variant = "hero", autoFocus = false, disabled = false }: {
  turns?: string[]; examples?: string[]; variant?: "hero" | "follow-up"; autoFocus?: boolean; disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const [example, setExample] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const followUp = variant === "follow-up";
  useEffect(() => {
    if (examples.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setExample(current => (current + 1) % examples.length), 4200);
    return () => window.clearInterval(timer);
  }, [examples.length]);
  useEffect(() => { if (autoFocus && window.matchMedia("(min-width: 900px)").matches) input.current?.focus({ preventScroll: true }); }, [autoFocus]);
  const placeholder = followUp
    ? (turns.length ? "Refine — e.g. only automatic" : "Describe the car you need…")
    : examples.length ? `Try “${examples[example]}”` : "Describe the car you need…";
  return <Form action="/discover" className={`composer composer-${variant}`} role="search" aria-label={followUp ? "Refine your search" : "Ask for a car"} onSubmit={event => { if (!value.trim()) event.preventDefault(); }}>
    {turns.map((turn, index) => <input key={index} type="hidden" name="q" value={turn} />)}
    <span className="composer-mark">{sparkle}</span>
    <label className="sr-only" htmlFor={`composer-${variant}`}>{followUp ? "Refine your search" : "Describe the car you need"}</label>
    <input ref={input} id={`composer-${variant}`} name="q" value={value} onChange={event => setValue(event.target.value.slice(0, 300))} placeholder={placeholder}
      autoComplete="off" enterKeyHint={followUp ? "send" : "search"} maxLength={300} disabled={disabled} />
    <button type="submit" className="composer-send" disabled={disabled} aria-label={followUp ? "Send refinement" : "Find cars"}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  </Form>;
}
