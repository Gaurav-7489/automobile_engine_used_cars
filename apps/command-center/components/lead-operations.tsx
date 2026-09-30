"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LeadStage } from "@vandlabs/contracts";

const stages: LeadStage[] = [
  "new",
  "contacted",
  "qualified",
  "appointment",
  "visited",
  "test_drive",
  "negotiation",
  "won",
  "lost",
  "nurture",
];

const labelize = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export function LeadOperations({
  leadId,
  initialStage,
  initialOwner,
  initialNotes,
}: {
  leadId: string;
  initialStage: LeadStage;
  initialOwner?: string;
  initialNotes?: string;
}) {
  const router = useRouter();
  const [stage, setStage] = useState(initialStage);
  const [owner, setOwner] = useState(initialOwner ?? "");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");

    try {
      const response = await fetch(`/command/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stage,
          assignedTo: owner || null,
          notes,
        }),
      });

      if (!response.ok) throw new Error("Lead update failed");
      setStatus("saved");
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  return (
    <form className="operations-form" onSubmit={save}>
      <div className="operations-grid">
        <label>
          <span>Pipeline stage</span>
          <select value={stage} onChange={(event) => setStage(event.target.value as LeadStage)}>
            {stages.map((item) => (
              <option key={item} value={item}>{labelize(item)}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Lead owner</span>
          <select value={owner} onChange={(event) => setOwner(event.target.value)}>
            <option value="">Unassigned</option>
            <option value="Maya">Maya</option>
            <option value="Kabir">Kabir</option>
          </select>
        </label>
      </div>
      <label>
        <span>Internal note</span>
        <textarea
          rows={4}
          maxLength={2000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Record qualification, next step, or outcome context"
        />
      </label>
      <div className="operations-actions">
        <button type="submit" disabled={status === "saving"}>
          {status === "saving" ? "Saving..." : "Save changes"}
        </button>
        <span role="status" aria-label="Lead update status" className={status === "error" ? "save-status error" : "save-status"}>
          {status === "saved" ? "Saved" : status === "error" ? "Could not save" : ""}
        </span>
      </div>
    </form>
  );
}
