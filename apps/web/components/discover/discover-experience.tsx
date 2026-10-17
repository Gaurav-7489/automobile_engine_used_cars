"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DiscoveryPage, ReelMatch } from "../../lib/discovery";
import { recordJourneyEvent } from "../../lib/attribution";
import { Composer } from "./composer";
import { EnquirySheet, type EnquiryTarget } from "./enquiry-sheet";
import { ReelSlide } from "./reel-slide";
import { useReducedMotion } from "./reel-media";

const href = (turns: string[]) => { const params = new URLSearchParams(); for (const turn of turns) params.append("q", turn); const query = params.toString(); return "/discover" + (query ? "?" + query : ""); };
const window_ = 2; // Slides rendered in full on each side of the active car.

export function DiscoverExperience({ page, turns, initialVehicle, editorial, whatsapp }: {
  page: DiscoveryPage; turns: string[]; initialVehicle?: string; editorial: boolean; whatsapp: string;
}) {
  const [results, setResults] = useState<ReelMatch[]>(page.results);
  const [nextCursor, setNextCursor] = useState(page.nextCursor);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, page.results.findIndex(match => match.card.slug === initialVehicle)));
  const [enquiry, setEnquiry] = useState<EnquiryTarget | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [summary, setSummary] = useState<{ text: string; model?: string } | null>(null);
  const feed = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const total = page.total;

  // Restore the car named in the address (refresh, back/forward, shared link) without animation.
  useEffect(() => {
    if (active > 0) feed.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "start" });
    if (turns.length) void recordJourneyEvent("inventory_search");
    // Runs once per search; the page remounts when the conversation changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const root = feed.current; if (!root) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
    }, { root, threshold: 0.6 });
    root.querySelectorAll(".reel-slide").forEach(slide => observer.observe(slide));
    return () => observer.disconnect();
  }, [results.length]);

  useEffect(() => {
    const slug = results[active]?.card.slug; if (!slug) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("v") === slug) return;
    url.searchParams.set("v", slug);
    window.history.replaceState(null, "", url.pathname + url.search);
  }, [active, results]);

  // One page request at a time; aborted only when this search unmounts.
  const inflight = useRef<AbortController | null>(null);
  useEffect(() => () => inflight.current?.abort(), []);
  const turnKey = turns.join("\n");
  useEffect(() => {
    if (nextCursor === null || inflight.current || loadFailed || active < results.length - 3) return;
    const controller = new AbortController(); inflight.current = controller;
    const params = new URLSearchParams(); for (const turn of turnKey ? turnKey.split("\n") : []) params.append("q", turn); params.set("cursor", String(nextCursor));
    setLoading(true);
    fetch("/api/discover?" + params.toString(), { signal: controller.signal, headers: { accept: "application/json" } })
      .then(response => response.ok ? response.json() as Promise<{ results: ReelMatch[]; nextCursor: number | null }> : Promise.reject(new Error(String(response.status))))
      .then(data => { setResults(current => [...current, ...data.results.filter(match => !current.some(item => item.vehicleId === match.vehicleId))]); setNextCursor(data.nextCursor); })
      .catch(error => { if ((error as Error).name !== "AbortError") setLoadFailed(true); })
      .finally(() => { if (inflight.current === controller) inflight.current = null; setLoading(false); });
  }, [active, results.length, nextCursor, loadFailed, turnKey]);

  useEffect(() => {
    if (!turnKey || !page.total) return;
    const controller = new AbortController();
    const params = new URLSearchParams(); for (const turn of turnKey.split("\n")) params.append("q", turn);
    fetch("/api/discover/summary?" + params.toString(), { signal: controller.signal, headers: { accept: "application/json" } })
      .then(response => response.ok ? response.json() as Promise<{ source: string; text?: string; model?: string }> : null)
      .then(data => { if (data?.source === "ai" && typeof data.text === "string") setSummary({ text: data.text, model: data.model }); })
      .catch(() => { /* The rule-based reply already explains the results. */ });
    return () => controller.abort();
  }, [turnKey, page.total]);

  const step = useCallback((delta: number) => {
    const target = Math.min(Math.max(active + delta, 0), results.length - 1);
    feed.current?.querySelector(`[data-index="${target}"]`)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [active, results.length, reduced]);

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (enquiry || event.altKey || event.ctrlKey || event.metaKey || target.closest("input, textarea, select, dialog, [contenteditable]")) return;
      if (["ArrowDown", "PageDown", "j"].includes(event.key)) { event.preventDefault(); step(1); }
      if (["ArrowUp", "PageUp", "k"].includes(event.key)) { event.preventDefault(); step(-1); }
      if (event.key === "Home" && target.closest(".reel")) { event.preventDefault(); step(-results.length); }
      if (event.key === "End" && target.closest(".reel")) { event.preventDefault(); step(results.length); }
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [step, enquiry, results.length]);

  const understood = page.chips.filter(chip => chip.kind !== "unsupported");
  return <div className={`discover${panelOpen ? " panel-open" : ""}`}>
    <aside className="discover-panel" aria-label="Your search">
      <div className="panel-head">
        <div><p className="eyebrow">VandLabs AI search</p><h1>{turns.length ? "Your search" : "Discover cars"}</h1></div>
        <button type="button" className="panel-toggle" aria-expanded={panelOpen} onClick={() => setPanelOpen(!panelOpen)}>{panelOpen ? "Show cars" : `Conversation${turns.length ? ` (${turns.length})` : ""}`}</button>
      </div>
      <div className="panel-scroll">
        <ol className="thread" aria-label="Conversation">
          {!turns.length && <li className="from-ai"><p>{page.reply}</p></li>}
          {page.thread.map((item, index) => <li key={index} className="turn-pair">
            <p className="from-you"><span className="sr-only">You: </span>{item.turn}</p>
            <div className="from-ai"><span className="sr-only">VandLabs: </span><p>{item.reply}</p>
              {index === page.thread.length - 1 && summary && <p className="ai-summary"><span className="ai-label">AI summary · based only on the cars shown</span>{summary.text}</p>}
            </div>
          </li>)}
        </ol>
        {understood.length > 0 && <div className="understood"><p className="panel-label">Understood</p><ul>{understood.map(chip => <li key={chip.key + chip.label} className={`chip chip-${chip.kind}`}><span>{chip.label}</span>{chip.remove && <Link href={href([...turns, chip.remove])} aria-label={`Remove ${chip.label}`} scroll={false}>×</Link>}</li>)}</ul></div>}
        {page.notices.length > 0 && <ul className="notices" aria-label="Things to know">{page.notices.map(notice => <li key={notice.text} className={`notice notice-${notice.kind}`}>{notice.text}</li>)}</ul>}
        {page.suggestions.length > 0 && <div className="suggestions"><p className="panel-label">{total ? "Refine" : "Try instead"}</p><div>{page.suggestions.map(item => <Link key={item.turn} href={href([...turns, item.turn])} scroll={false}>{item.label}</Link>)}</div></div>}
        <p className="panel-links">{turns.length > 0 && <Link href="/discover">New search</Link>}<Link href="/inventory">Browse as a list</Link></p>
      </div>
      <Composer turns={turns} variant="follow-up" autoFocus={!turns.length} disabled={turns.length >= 10} />
    </aside>

    <section className="reel-stage" aria-label="Matching cars">
      <button type="button" className="reel-search-toggle" aria-expanded={panelOpen} onClick={() => setPanelOpen(true)}><span aria-hidden="true">✦</span>{turns.length ? "Your search" : "Ask AI"} · {total} {total === 1 ? "car" : "cars"}</button>
      <p className="reel-summary" role="status">{total ? `${total} ${total === 1 ? "car matches" : "cars match"}` : "No cars match yet"}{page.reserved ? ` · ${page.reserved} reserved` : ""}</p>
      {total > 0 ? <div className="reel" ref={feed} role="feed" aria-label="Matching cars, one at a time" aria-busy={loading} tabIndex={0}>
        {results.map((match, index) => <ReelSlide key={match.vehicleId} match={match} index={index} total={total} active={index === active}
          near={Math.abs(index - active) <= window_} editorial={editorial} whatsapp={whatsapp} onEnquire={setEnquiry} />)}
        {loadFailed && <div className="reel-more" role="alert">More cars couldn&apos;t load. <button type="button" className="text-button" onClick={() => setLoadFailed(false)}>Try again</button></div>}
      </div> : <div className="reel reel-empty">
        <div className="empty-card" role="status">
          <span className="empty-mark" aria-hidden="true">✦</span>
          <h2>{page.reply.split(". ")[0].replace(/\.$/, "")}.</h2>
          <p>{page.reply.split(". ").slice(1).join(". ")}</p>
          <div className="empty-actions">{page.suggestions.map(item => <Link key={item.turn} className="button" href={href([...turns, item.turn])}>{item.label}</Link>)}</div>
        </div>
      </div>}
      {total > 1 && <nav className="reel-nav-rail" aria-label="Move between cars">
        <button type="button" onClick={() => step(-1)} disabled={active === 0} aria-label="Previous car">↑</button>
        <span aria-live="polite"><strong>{active + 1}</strong><small>/{total}</small></span>
        <button type="button" onClick={() => step(1)} disabled={active >= results.length - 1} aria-label="Next car">↓</button>
      </nav>}
    </section>
    <EnquirySheet target={enquiry} turns={turns} onClose={() => setEnquiry(null)} />
  </div>;
}
