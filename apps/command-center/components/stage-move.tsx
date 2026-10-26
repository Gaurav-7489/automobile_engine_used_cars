"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const options = [["new", "New"], ["contacted", "Contacted"], ["qualified", "Qualified"], ["appointment", "Appointment"], ["visited", "Visited"], ["test_drive", "Test drive"], ["negotiation", "Negotiation"], ["lost", "Lost"], ["nurture", "Nurture"]] as const;

/** Move a lead to another open stage, or close it as lost or nurture. Won needs a verified sale, recorded on the lead. */
export function StageMove({ leadId, name, stage, version }: { leadId: string; name: string; stage: string; version: number }) {
  const router = useRouter(), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [failed, setFailed] = useState(false);
  useEffect(() => setReady(true), []);
  async function move(next: string) {
    if (next === stage) return;
    setBusy(true); setMessage(""); setFailed(false);
    try {
      const response = await fetch(`/command/api/leads/${leadId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage: next, expectedVersion: version }) });
      if (!response.ok) throw new Error(response.status === 409 ? "This lead changed. Reload to see the latest." : "Could not move this lead.");
      setMessage("Moved"); router.refresh();
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Could not move this lead."); } finally { setBusy(false); }
  }
  return <label className="pl-move"><span className="sr-only">Move {name} to another stage</span>
    <select value={stage} disabled={!ready || busy} onChange={event => void move(event.target.value)}>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    <small role={failed ? "alert" : "status"}>{message}</small></label>;
}
