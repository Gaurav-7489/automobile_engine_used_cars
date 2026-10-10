"use client";
import { useState } from "react";
import Link from "next/link";
import type { LeadIntent } from "@vandlabs/contracts";
import { LeadForm } from "./lead-form";
import { useShortlist, type ShortlistVehicle } from "./shortlist";

const intents: { id: LeadIntent; label: string; text: string; mark: string }[] = [
  { id: "enquiry", label: "Ask a question", text: "A detail, a shortlist, a starting point.", mark: "?" },
  { id: "test_drive", label: "Request a test drive", text: "Meet the car before you make it yours.", mark: "↗" },
  { id: "finance", label: "Discuss finance", text: "Explore options with a specialist.", mark: "₹" },
  { id: "exchange", label: "Discuss an exchange", text: "Tell us about the car you drive today.", mark: "⇄" },
];
export function ContactWorkspace({ vehicles, requestedIds, defaultIntent }: { vehicles: ShortlistVehicle[]; requestedIds: string[]; defaultIntent: LeadIntent }) {
  const { ids } = useShortlist();
  const [intent, setIntent] = useState<LeadIntent>(defaultIntent);
  const [choice, setChoice] = useState<string | null>(null);
  const contextIds = requestedIds.length ? requestedIds : ids;
  const contextual = contextIds.map(id => vehicles.find(v => v.id === id)).filter((v): v is ShortlistVehicle => !!v);
  const selectedId = choice ?? contextual.find(v => v.availabilityStatus === "available")?.id ?? "";
  const selected = vehicles.find(v => v.id === selectedId);
  const contextNote = contextual.length > 1 ? "Compared shortlist: " + contextual.map(v => `${v.make} ${v.model} (${v.id})`).join("; ") : undefined;
  return <div className="contact-workspace">
    <section className="intent-section" aria-label="Choose your enquiry"><div className="sectionhead"><div><p className="eyebrow">Make it yours</p><h2>How can we help?</h2></div><span className="subtle">01 / Choose your conversation</span></div><div className="intent-grid">{intents.map(item => <button type="button" key={item.id} aria-pressed={intent === item.id} onClick={() => setIntent(item.id)}><span className="intent-mark" aria-hidden="true">{item.mark}</span><strong>{item.label}</strong><span>{item.text}</span></button>)}</div></section>
    <div className="contact-form-layout"><aside className="conversation-guide" data-reveal><p className="eyebrow">A better conversation</p><h2>We start<br />with you.</h2><ol><li><span>01</span><div><strong>Tell us what matters.</strong><p>A vehicle, a question, a preferred visit. Give us a little context.</p></div></li><li><span>02</span><div><strong>A person picks it up.</strong><p>Your request goes to the dealership with your selected car attached.</p></div></li><li><span>03</span><div><strong>Decide at your pace.</strong><p>Availability, finance and visit details are confirmed by the team.</p></div></li></ol><Link href="/inventory" className="rolling-link">Keep exploring the collection ↗</Link></aside>
    <section className="form-panel modern-form"><p className="eyebrow">02 / A little context</p><h2>Start the conversation.</h2><label className="vehicle-context-picker"><span>Vehicle of interest</span><select value={selectedId} onChange={e => setChoice(e.target.value)}><option value="">Help me choose / general enquiry</option>{vehicles.filter(v => v.availabilityStatus === "available").map(v => <option key={v.id} value={v.id}>{v.year} {v.make} {v.model}</option>)}</select></label>
      {contextual.length > 0 && <div className="contact-context" aria-label="Your vehicle context"><span className="meta">Brought from your shortlist</span>{contextual.map(v => <Link key={v.id} href={`/vehicles/${v.slug}`}>{v.make} {v.model} <span className="meta">{v.availabilityStatus}</span> ↗</Link>)}</div>}
      {contextual.some(v => v.availabilityStatus !== "available") && <p className="subtle">Some shortlisted cars are reserved or sold. Choose an available car or ask a general availability question; a visit is not confirmed here.</p>}
      <LeadForm vehicleId={selected?.id} vehicleLabel={selected ? `${selected.year} ${selected.make} ${selected.model}` : undefined} vehicleIds={contextual.map(v => v.id)} selectedIntent={intent} onIntentChange={setIntent} contextNote={contextNote} />
    </section></div>
  </div>;
}
