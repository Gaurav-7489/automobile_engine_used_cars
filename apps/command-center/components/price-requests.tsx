"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PriceChangeRequest, Vehicle } from "@vandlabs/contracts";

async function send(path: string, method: "POST" | "PATCH", body: unknown) {
  const response = await fetch(`/command/api${path}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || "Could not save. Please retry."); }
}
function useAction() {
  const router = useRouter(), [ready, setReady] = useState(false), [working, setWorking] = useState(false), [message, setMessage] = useState(""), [failed, setFailed] = useState(false);
  // Controls stay disabled until hydration so a click before the page is interactive cannot do nothing, or submit natively.
  useEffect(() => setReady(true), []);
  const busy = working || !ready;
  async function run(action: () => Promise<void>, done: string) {
    setWorking(true); setMessage(""); setFailed(false);
    try { await action(); setMessage(done); router.refresh(); } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Could not save."); } finally { setWorking(false); }
  }
  return { busy, message, failed, run };
}

/** Raise a price change for the owner to decide. Small, in-policy changes are made from the operations row instead. */
export function PriceRequestForm({ vehicle, pending }: { vehicle: Vehicle; pending?: PriceChangeRequest }) {
  const { busy, message, failed, run } = useAction();
  if (pending) return <p className="ck-note">Request pending: ₹{pending.proposedPrice.toLocaleString("en-IN")}. Waiting for an owner decision.</p>;
  return <details className="ck-request"><summary>Request price change</summary>
    <form className="operations-form" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget);
      void run(() => send("/inventory/price-requests", "POST", { vehicleId: vehicle.id, proposedPrice: Number(form.get("proposedPrice")), note: String(form.get("note")), expectedVersion: vehicle.version ?? 0 }), "Request sent"); }}>
      <fieldset disabled={busy}>
        <label><span>Proposed asking price (INR)</span><input name="proposedPrice" type="number" min="1" step="1" required aria-label={`Proposed price ${vehicle.stockId}`} /></label>
        <label><span>Why this price</span><textarea name="note" required maxLength={500} rows={2} aria-label={`Reason ${vehicle.stockId}`} /></label>
        <button>Send for approval</button>
      </fieldset>
      <small role={failed ? "alert" : "status"}>{message}</small>
    </form></details>;
}

export function DecisionControls({ request }: { request: PriceChangeRequest }) {
  const { busy, message, failed, run } = useAction();
  const [rejecting, setRejecting] = useState(false);
  return <div className="ck-decision">
    {rejecting ? <form onSubmit={event => { event.preventDefault(); const note = String(new FormData(event.currentTarget).get("note")); void run(() => send(`/inventory/price-requests/${request.id}`, "PATCH", { decision: "rejected", note }), "Rejected"); }}>
      <label><span>Reason for rejecting</span><input name="note" required maxLength={500} /></label>
      <div className="ck-decision-actions"><button disabled={busy}>Confirm rejection</button><button type="button" className="ck-link" onClick={() => setRejecting(false)}>Cancel</button></div></form>
      : <div className="ck-decision-actions">
        <button disabled={busy} onClick={() => void run(() => send(`/inventory/price-requests/${request.id}`, "PATCH", { decision: "approved" }), "Approved and applied")}>Approve ₹{request.proposedPrice.toLocaleString("en-IN")}</button>
        <button disabled={busy} className="ck-link" onClick={() => setRejecting(true)}>Reject…</button></div>}
    <small role={failed ? "alert" : "status"}>{message}</small>
  </div>;
}
