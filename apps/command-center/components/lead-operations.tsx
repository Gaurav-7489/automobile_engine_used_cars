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
  initialVersion,
  initialOwner,
  initialNotes,
  staffOptions,
  assignedLeadOnly,
}: {
  leadId: string;
  initialStage: LeadStage;
  initialVersion: number;
  initialOwner?: string;
  initialNotes?: string;
  staffOptions: {id:string;name:string}[];
  assignedLeadOnly?:boolean;
}) {
  const router = useRouter();
  const [version,setVersion]=useState(initialVersion);
  const [error,setError]=useState("");
  const [conflict,setConflict]=useState(false);
  const [stage, setStage] = useState(initialStage);
  const [owner, setOwner] = useState(initialOwner ?? "");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setError("");

    try {
      const response = await fetch(`/command/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stage,
          expectedVersion:version,
          assignedTo: owner || null,
          notes,
        }),
      });

      const result=await response.json();
      if (!response.ok) {if(response.status===409)setConflict(true);throw new Error(response.status===409?"This lead changed. Reload and review before saving.":"Could not save this lead.");}
      setVersion(result.data.version);
      setStatus("saved");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error?error.message:"Could not save this lead.");
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
          <select value={owner} disabled={assignedLeadOnly} onChange={(event) => setOwner(event.target.value)}>
            <option value="">Unassigned</option>
            {owner&&!staffOptions.some(s=>s.id===owner)?<option value={owner}>{owner} (previous assignment)</option>:null}
            {staffOptions.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
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
        <button type="submit" disabled={status === "saving"||conflict}>
          {status === "saving" ? "Saving..." : "Save changes"}
        </button>
        <span role="status" aria-label="Lead update status" className={status === "error" ? "save-status error" : "save-status"}>
          {status === "saved" ? "Saved" : status === "error" ? error : ""}
        </span>
        {conflict?<button type="button" onClick={()=>window.location.reload()}>Reload current lead</button>:null}
      </div>
    </form>
  );
}
