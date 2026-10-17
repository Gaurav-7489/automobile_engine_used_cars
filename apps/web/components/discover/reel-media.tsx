"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { ReelCard } from "../../lib/discovery";

const optimized = (url: string) => url.startsWith("https://images.unsplash.com/");

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Photos load only near the active car; at most the active car's video exists in the page. */
export function ReelMedia({ card, title, active, near, eager, editorial }: { card: ReelCard; title: string; active: boolean; near: boolean; eager: boolean; editorial: boolean }) {
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<"auto" | "play" | "pause">("auto");
  const track = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const reduced = useReducedMotion();
  const media = card.media, current = media[index];
  // Muted autoplay only for the active car, and never when the viewer prefers reduced motion.
  const playing = active && (choice === "play" || (choice === "auto" && !reduced));
  useEffect(() => {
    const element = video.current; if (!element) return;
    if (playing) element.play().catch(() => setChoice("pause")); else element.pause();
  }, [playing, index]);
  useEffect(() => { if (!active) setChoice("auto"); }, [active]);
  const go = (next: number) => {
    const target = Math.min(Math.max(next, 0), media.length - 1);
    track.current?.children[target]?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest", inline: "start" });
    setIndex(target);
  };
  if (!media.length) return <div className="reel-media reel-media-empty"><span>Photos coming soon</span><small>Ask the dealer for current photos of this car.</small></div>;
  const backdrop = current?.kind === "video" ? current.poster : current?.url;
  return <div className="reel-media">
    {near && backdrop && <Image className="reel-backdrop" src={backdrop} alt="" aria-hidden="true" fill sizes="48px" quality={40} unoptimized={!optimized(backdrop)} />}
    <div className="reel-track" ref={track} onScroll={event => { const element = event.currentTarget; const next = Math.round(element.scrollLeft / Math.max(element.clientWidth, 1)); if (next !== index) setIndex(next); }}>
      {media.map((item, i) => <div className="reel-frame" key={`${item.url}-${i}`} aria-hidden={i !== index}>
        {item.kind === "video"
          ? active && i === index
            ? <video ref={video} className="reel-video" src={item.url} poster={item.poster} muted playsInline loop preload="metadata" aria-label={`${title} video`} />
            : item.poster && near ? <Image className="reel-photo" src={item.poster} alt={`${title} video preview`} fill sizes="(max-width: 900px) 100vw, 60vw" unoptimized={!optimized(item.poster)} /> : null
          : near && Math.abs(i - index) <= 1
            ? <Image className={`reel-photo${active && i === index && !reduced ? " is-drifting" : ""}`} src={item.url} alt={item.alt || `${title}, photo ${i + 1}`} fill
                sizes="(max-width: 900px) 100vw, 60vw" priority={eager && i === 0} loading={eager && i === 0 ? undefined : "lazy"} unoptimized={!optimized(item.url)} />
            : null}
      </div>)}
    </div>
    {media.length > 1 && <>
      <button type="button" className="reel-nav prev" onClick={() => go(index - 1)} disabled={index === 0} aria-label={`Previous photo of ${title}`}>‹</button>
      <button type="button" className="reel-nav next" onClick={() => go(index + 1)} disabled={index === media.length - 1} aria-label={`Next photo of ${title}`}>›</button>
      <span className="reel-count" aria-hidden="true">{index + 1}/{media.length}</span>
      <div className="reel-dots" aria-hidden="true">{media.map((item, i) => <span key={`${item.url}-${i}`} className={i === index ? "on" : undefined} />)}</div>
    </>}
    {current?.kind === "video" && active && <button type="button" className="reel-play" onClick={() => setChoice(playing ? "pause" : "play")} aria-label={playing ? "Pause video" : "Play video"}>{playing ? "❚❚" : "▶"}</button>}
    {editorial && <span className="reel-editorial">Editorial photo — not this exact car</span>}
  </div>;
}
