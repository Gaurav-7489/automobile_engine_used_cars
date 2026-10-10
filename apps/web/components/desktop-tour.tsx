"use client";
import { useRef, useState, type KeyboardEvent, type FormEvent } from "react";
import Link from "next/link";
import type { ShortlistVehicle } from "./shortlist";
import { money } from "../lib/format";
import { useShortlist } from "./shortlist";

const tabs = ["Inventory", "Lead journey", "Workspace"];
export function DesktopTour({ vehicles }: { vehicles: ShortlistVehicle[] }) {
  const [tab, setTab] = useState(0);
  const [workspace, setWorkspace] = useState("");
  const [status, setStatus] = useState("");
  const tablist = useRef<HTMLDivElement>(null);
  const { ids } = useShortlist();
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : null;
    if (next === null) return;
    event.preventDefault(); setTab(next); tablist.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  }
  function check(event: FormEvent) {
    event.preventDefault();
    try { const url = new URL(workspace); if (url.protocol !== "https:" || url.username || url.password) throw new Error(); setStatus("HTTPS format looks good. Your administrator must confirm that this workspace is active; no connection was attempted."); }
    catch { setStatus("Use a complete HTTPS workspace URL, such as https://dealer.example/command."); }
  }
  return <section className="desktop-tour" data-reveal><div className="tour-heading"><p className="eyebrow">A closer look</p><h2>Your day.<br />In one place.</h2><p className="subtle">Explore the product tour. Reference inventory, illustrative workflow.</p></div><div className="app-frame"><div className="app-titlebar"><span className="window-dots" aria-hidden="true"><i /><i /><i /></span><span>VandLabs Automobile Engine</span><span className="tour-badge">Product tour</span></div><div className="app-tour-body"><div className="tour-tabs" role="tablist" aria-label="Desktop product tour" ref={tablist}>{tabs.map((label, index) => <button key={label} type="button" role="tab" id={`tour-tab-${index}`} aria-selected={tab === index} aria-controls={`tour-panel-${index}`} tabIndex={tab === index ? 0 : -1} onClick={() => setTab(index)} onKeyDown={event => move(event, index)}>{label}</button>)}</div>
      <div key={tab} id={`tour-panel-${tab}`} role="tabpanel" aria-labelledby={`tour-tab-${tab}`} className="tour-panel" tabIndex={0}>
        {tab === 0 ? <><div className="tour-panel-head"><div><span className="meta">THE REFERENCE COLLECTION</span><h3>Know what’s in stock.</h3></div><span className="tour-stat">{vehicles.filter(v => v.availabilityStatus === "available").length}<small>available vehicles</small></span></div><div className="tour-vehicle-list">{vehicles.slice(0, 4).map(v => <Link key={v.id} href={`/vehicles/${v.slug}`}><span className="tour-initial" aria-hidden="true">{v.make.slice(0, 1)}</span><span><strong>{v.make} {v.model}</strong><small>{v.year} · {v.availabilityStatus}</small></span><strong>{money(v.price)}</strong><span aria-hidden="true">↗</span></Link>)}</div><Link href="/inventory" className="rolling-link">Explore all inventory ↗</Link></> : tab === 1 ? <><div className="tour-panel-head"><div><span className="meta">ILLUSTRATIVE WORKFLOW</span><h3>Every next step has context.</h3></div></div><div className="journey-path">{["Discover a car", "Send an enquiry", "Team follows up", "Confirm a visit", "Record the outcome"].map((label, index) => <div key={label}><span>{String(index + 1).padStart(2, "0")}</span><strong>{label}</strong></div>)}</div><p className="subtle">Vehicle context flows into the dealership’s lead workspace. Live operations require the activated backend and staff sign-in.</p><Link className="rolling-link" href={ids.length ? `/contact?ids=${ids.join(",")}` : "/contact"}>Start with your shortlist ↗</Link></> : <><div className="tour-panel-head"><div><span className="meta">ONE WORKSPACE URL</span><h3>One connection. Your dealership.</h3></div></div><p className="subtle">Your administrator provides the active HTTPS workspace URL. The native app discovers its public sign-in settings.</p><form className="workspace-check" onSubmit={check}><label><span>Workspace URL</span><input type="url" value={workspace} onChange={e => { setWorkspace(e.target.value); setStatus(""); }} placeholder="https://dealer.example/command" required /></label><button type="submit" className="button primary">Check URL format</button></form><p role="status" className="workspace-status">{status}</p><p className="meta">This tour checks the URL format only. It does not sign in or contact the address.</p><Link href="/contact" className="rolling-link">Ask about workspace access ↗</Link></>}
      </div></div></div></section>;
}
