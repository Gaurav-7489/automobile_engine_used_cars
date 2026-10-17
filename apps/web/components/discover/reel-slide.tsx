"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReelMatch } from "../../lib/discovery";
import { number, rupees } from "../../lib/format";
import { SaveButton } from "../saved";
import { TrackedAction } from "../tracked-action";
import { ReelMedia } from "./reel-media";
import type { EnquiryTarget } from "./enquiry-sheet";

const icon = (path: string) => <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d={path} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const shareIcon = icon("M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7");
const callIcon = icon("M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2");
const chatIcon = icon("M4 20l1.4-4.2A8 8 0 1 1 8.6 19L4 20z M9 10h.01 M12 10h.01 M15 10h.01");
const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export function ReelSlide({ match, index, total, active, near, editorial, whatsapp, onEnquire }: {
  match: ReelMatch; index: number; total: number; active: boolean; near: boolean; editorial: boolean; whatsapp: string;
  onEnquire: (target: EnquiryTarget) => void;
}) {
  const card = match.card;
  const title = `${card.year} ${card.make} ${card.model}`;
  const [shared, setShared] = useState("");
  const headingId = `reel-${card.id}`;
  if (!near) return <article className="reel-slide is-placeholder" aria-labelledby={headingId} aria-posinset={index + 1} aria-setsize={total} data-index={index}><h2 id={headingId} className="sr-only">{title}</h2></article>;
  const message = encodeURIComponent(`Hi, I'm interested in the ${title} ${card.variant} (${card.stockId}). Is it available?`);
  const share = async () => {
    const url = new URL(`/vehicles/${card.slug}`, window.location.origin).href;
    try {
      if (navigator.share) { await navigator.share({ title, url }); setShared(""); return; }
      await navigator.clipboard.writeText(url); setShared("Link copied");
    } catch (error) { if ((error as Error)?.name !== "AbortError") setShared("Copy failed — open details to share"); }
  };
  const facts = [String(card.year), `${number(card.mileage)} km`, titleCase(card.fuelType), titleCase(card.transmission), card.ownership === 1 ? "1st owner" : `${card.ownership} owners`];
  return <article className={`reel-slide${active ? " is-active" : ""}`} aria-labelledby={headingId} aria-posinset={index + 1} aria-setsize={total} data-index={index} data-vehicle={card.slug}>
    <div className="reel-card">
      <ReelMedia card={card} title={title} active={active} near={near} eager={index === 0} editorial={editorial} />
      <div className="reel-top"><span className="reel-rank">Match {match.rank} of {total}</span></div>
      <div className="reel-rail-actions" aria-label={`Actions for ${title}`} role="group">
        <SaveButton id={card.id} name={title} className="reel-action" showLabel />
        <button type="button" className="reel-action" onClick={share} aria-label={`Share ${title}`}>{shareIcon}<span>Share</span></button>
        <TrackedAction className="reel-action" href={`https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${message}`} eventType="whatsapp_click" vehicleId={card.id}>{chatIcon}<span>WhatsApp</span></TrackedAction>
        {card.phone && <TrackedAction className="reel-action" href={`tel:${card.phone.replace(/[^\d+]/g, "")}`} eventType="call_click" vehicleId={card.id}>{callIcon}<span>Call</span></TrackedAction>}
        <span className="sr-only" role="status">{shared}</span>
        {shared && <b className="reel-toast" aria-hidden="true">{shared}</b>}
      </div>
      <div className="reel-info">
        <p className="reel-dealer">{card.dealership}{card.location ? ` · ${card.location.name}` : ""}</p>
        <h2 id={headingId}>{title}</h2>
        <p className="reel-variant">{card.variant}</p>
        <p className="reel-price">{card.price > 0 ? rupees(card.price) : "Price on request"}</p>
        <ul className="reel-facts" aria-label="Key facts">{facts.map(fact => <li key={fact}>{fact}</li>)}{card.location && <li>{card.location.city}</li>}</ul>
        <details className="reel-why" open={active}>
          <summary><span aria-hidden="true">✦</span> Why it matches</summary>
          <p>{match.summary}</p>
          {(match.requirements.length > 0 || match.strengths.length > 0 || match.caveats.length > 0) && <ul>
            {match.requirements.map(item => <li key={"r" + item} className="is-met">{item}</li>)}
            {match.strengths.map(item => <li key={"s" + item} className="is-plus">{item}</li>)}
            {match.caveats.map(item => <li key={"c" + item} className="is-check">{item}</li>)}
          </ul>}
        </details>
        <div className="reel-cta">
          <button type="button" className="button primary" onClick={() => onEnquire({ vehicleId: card.id, label: title, intent: "enquiry" })}>Enquire</button>
          <button type="button" className="button" onClick={() => onEnquire({ vehicleId: card.id, label: title, intent: "test_drive" })}><span className="reel-long">Book test drive</span><span className="reel-short">Test drive</span></button>
          <Link className="reel-details" href={`/vehicles/${card.slug}`} aria-label={`Full details of ${title}`}><span className="reel-long">Full details</span><span className="reel-short">Details</span> <span aria-hidden="true">→</span></Link>
        </div>
      </div>
    </div>
  </article>;
}
