"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { LeadIntent } from "@vandlabs/contracts";
import { readAttribution, recordJourneyEvent } from "../lib/attribution";

export function LeadForm({
  vehicleId,
  vehicleLabel,
  defaultIntent = "enquiry",
  selectedIntent,
  onIntentChange,
  contextNote,
  vehicleIds,
}: {
  vehicleId?: string;
  vehicleLabel?: string;
  defaultIntent?: LeadIntent;
  selectedIntent?: LeadIntent;
  onIntentChange?: (intent: LeadIntent) => void;
  contextNote?: string;
  vehicleIds?: string[];
}) {
  const [state, setState] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [leadId, setLeadId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const submitting = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => activeRequest.current?.abort(), []);
  const successHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (state === "success") successHeading.current?.focus(); }, [state]);
  const [intentChoice, setIntentChoice] = useState(defaultIntent);
  const readOnly = process.env.NEXT_PUBLIC_PREVIEW_READ_ONLY === "true";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || submitting.current) return;
    submitting.current = true;
    setErrorMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    setState("submitting");

    const intent = String(data.get("intent") || defaultIntent) as LeadIntent;
    const payload = {
      name: String(data.get("name") || ""),
      phone: String(data.get("phone") || ""),
      email: String(data.get("email") || ""),
      intent,
      vehicleId,
      vehicleIds: [...new Set([...(vehicleId ? [vehicleId] : []), ...(vehicleIds ?? [])])].slice(0, 3),
      notes: [contextNote, String(data.get("notes") || "")].filter(Boolean).join("\n"),
      whatsappConsent: data.get("whatsappConsent") === "on",
      marketingConsent: data.get("marketingConsent") === "on",
      attribution: readAttribution(),
    };

    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const message = response.status === 429 ? "Too many requests. Wait a moment before trying again."
          : response.status === 400 ? "Check your details and the selected car’s availability, then try again."
          : response.status === 503 ? "Enquiries are temporarily unavailable. Please contact the studio."
          : "We could not confirm your request. It may have been received; contact the studio before sending it again.";
        setErrorMessage(message); setState("error"); return;
      }
      const result = (await response.json()) as { leadId: string };
      if (typeof result.leadId !== "string" || !result.leadId) throw new Error("Missing request reference");
      setLeadId(result.leadId);
      setState("success");
      form.reset();
      const eventName =
        intent === "test_drive"
          ? "test_drive_requested"
          : intent === "finance"
            ? "finance_interest"
            : intent === "exchange"
              ? "exchange_interest"
              : "lead_created";
      void recordJourneyEvent(eventName, { vehicleId });
    } catch {
      setErrorMessage("We could not confirm your request. It may have been received; contact the studio before sending it again.");
      setState("error");
    } finally { clearTimeout(timeout); activeRequest.current = null; submitting.current = false; }
  }

  if (state === "success") {
    return (
      <div className="form-success" role="status">
        <p className="eyebrow">Request received</p>
        <h3 ref={successHeading} tabIndex={-1}>We have the context.</h3>
        <p>
          {vehicleLabel
            ? "Your request is attached to " + vehicleLabel + "."
            : "A sales advisor can now follow up with the right context."}
        </p>
        <p className="meta">Request reference · {leadId}</p>
        <button className="text-button" type="button" onClick={() => setState("idle")}>
          Send another request
        </button>
      </div>
    );
  }

  return (
    <form className="lead-form" onSubmit={submit} aria-busy={state === "submitting"}>
      {readOnly && <div className="preview-form-note" role="status"><strong>Explore the form. Enquiries are unavailable in this preview.</strong><p>Sending, bookings and live contact become available when the shared backend is connected.</p></div>}
      <fieldset disabled={readOnly || state === "submitting"}>
      <div className="form-row">
        <label>
          <span>Name</span>
          <input name="name" required autoComplete="name" maxLength={120} />
        </label>
        <label>
          <span>Phone</span>
          <input name="phone" required type="tel" autoComplete="tel" maxLength={32} />
        </label>
      </div>
      <div className="form-row">
        <label>
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" maxLength={254} />
        </label>
        <label>
          <span>I want to</span>
          <select name="intent" value={selectedIntent ?? intentChoice} onChange={e => { const next = e.target.value as LeadIntent; setIntentChoice(next); onIntentChange?.(next); }}>
            <option value="enquiry">Enquire about the car</option>
            <option value="test_drive">Book a test drive</option>
            <option value="finance">Discuss finance</option>
            <option value="exchange">Discuss an exchange</option>
          </select>
        </label>
      </div>
      <label>
        <span>Anything we should know?</span>
        <textarea
          name="notes"
          rows={4}
          maxLength={1600}
          placeholder="Preferred time, current car, questions..."
        />
      </label>
      <label className="check-row">
        <input type="checkbox" name="whatsappConsent" />
        <span>It is okay to contact me on WhatsApp about this request.</span>
      </label>
      <label className="check-row">
        <input type="checkbox" name="marketingConsent" />
        <span>I also want future offers and updates. Optional.</span>
      </label>
      <button className="button primary" disabled={state === "submitting"}>
        {state === "submitting" ? "Sending..." : "Send request"}
      </button>
      </fieldset>
      {state === "error" ? (
        <p className="form-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </form>
  );
}
