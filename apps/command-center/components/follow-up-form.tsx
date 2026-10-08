"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function FollowUpForm({
  leadId,
  initialOwner,
}: {
  leadId: string;
  initialOwner?: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState(initialOwner ?? "Maya");
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState<"normal" | "high">("normal");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function createFollowUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");

    try {
      const response = await fetch(`/command/api/leads/${leadId}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, owner, dueAt: new Date(dueAt).toISOString(), priority }),
      });
      if (!response.ok) throw new Error("Follow-up creation failed");

      setTitle("");
      setDueAt("");
      setPriority("normal");
      setStatus("saved");
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  return (
    <form className="operations-form" onSubmit={createFollowUp}>
      <label>
        <span>Follow-up</span>
        <input
          required
          maxLength={160}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Call after finance document review"
        />
      </label>
      <div className="follow-up-grid">
        <label>
          <span>Follow-up owner</span>
          <select value={owner} onChange={(event) => setOwner(event.target.value)}>
            <option value="Maya">Maya</option>
            <option value="Kabir">Kabir</option>
          </select>
        </label>
        <label>
          <span>Due</span>
          <input required type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
        </label>
        <label>
          <span>Priority</span>
          <select value={priority} onChange={(event) => setPriority(event.target.value as "normal" | "high")}>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </label>
      </div>
      <div className="operations-actions">
        <button type="submit" disabled={status === "saving"}>
          {status === "saving" ? "Scheduling..." : "Schedule follow-up"}
        </button>
        <span role="status" aria-label="Follow-up status" className={status === "error" ? "save-status error" : "save-status"}>
          {status === "saved" ? "Scheduled" : status === "error" ? "Could not schedule" : ""}
        </span>
      </div>
    </form>
  );
}
