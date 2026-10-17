"use client";

import { useEffect, useRef } from "react";
import type { LeadIntent } from "@vandlabs/contracts";
import { LeadForm } from "../lead-form";

export type EnquiryTarget = { vehicleId: string; label: string; intent: LeadIntent };

/** A native modal keeps focus inside, closes on Escape and returns focus to the opener. */
export function EnquirySheet({ target, turns, onClose }: { target: EnquiryTarget | null; turns: string[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current; if (!element) return;
    if (target && !element.open) element.showModal();
    if (!target && element.open) element.close();
  }, [target]);
  return <dialog ref={dialog} className="enquiry-sheet" aria-labelledby="enquiry-title" onClose={onClose} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
    {target && <div className="enquiry-body">
      <header>
        <div><p className="eyebrow">{target.intent === "test_drive" ? "Book a test drive" : "Enquire"}</p><h2 id="enquiry-title">{target.label}</h2></div>
        <button type="button" className="enquiry-close" onClick={() => dialog.current?.close()} aria-label="Close enquiry">×</button>
      </header>
      <p className="enquiry-note">Your request goes straight to the dealership with this car attached. A test-drive request is confirmed by the dealer — it isn&apos;t booked automatically.</p>
      <LeadForm key={target.vehicleId + target.intent} vehicleId={target.vehicleId} vehicleLabel={target.label} defaultIntent={target.intent} discoveryTurns={turns} />
    </div>}
  </dialog>;
}
