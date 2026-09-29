"use client";

import { useState, type FormEvent } from "react";
import type { LeadIntent } from "@vandlabs/contracts";
import { readAttribution, recordJourneyEvent } from "../lib/attribution";

export function LeadForm({
  vehicleId,
  vehicleLabel,
  defaultIntent = "enquiry",
}: {
  vehicleId?: string;
  vehicleLabel?: string;
  defaultIntent?: LeadIntent;
}) {
  const [state, setState] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [leadId, setLeadId] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      notes: String(data.get("notes") || ""),
      whatsappConsent: data.get("whatsappConsent") === "on",
      marketingConsent: data.get("marketingConsent") === "on",
      attribution: readAttribution(),
    };

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Lead creation failed");
      const result = (await response.json()) as { leadId: string };
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
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="form-success" role="status">
        <p className="eyebrow">Request received</p>
        <h3>We have the context.</h3>
        <p>
          {vehicleLabel
            ? "Your request is attached to " + vehicleLabel + "."
            : "A sales advisor can now follow up with the right context."}
        </p>
        <p className="meta">Demo lead reference · {leadId}</p>
        <button className="text-button" type="button" onClick={() => setState("idle")}>
          Send another request
        </button>
      </div>
    );
  }

  return (
    <form className="lead-form" onSubmit={submit}>
      <div className="form-row">
        <label>
          <span>Name</span>
          <input name="name" required autoComplete="name" />
        </label>
        <label>
          <span>Phone</span>
          <input name="phone" required inputMode="tel" autoComplete="tel" />
        </label>
      </div>
      <div className="form-row">
        <label>
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" />
        </label>
        <label>
          <span>I want to</span>
          <select name="intent" defaultValue={defaultIntent}>
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
      {state === "error" ? (
        <p className="form-error" role="alert">
          The request could not be sent. Please call or WhatsApp the studio.
        </p>
      ) : null}
    </form>
  );
}
