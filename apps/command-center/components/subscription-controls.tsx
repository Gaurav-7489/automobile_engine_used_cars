"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { dealerAction } from "./dealer-fetch";
import type { CommercePlan } from "@vandlabs/contracts";
export function DemoPlanControl({ plan }: { plan: CommercePlan }) {
  const router = useRouter(), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  return <div><button disabled={busy} onClick={() => { setBusy(true); void dealerAction("demo-plan", { plan }).then(() => { setMessage("Demo subscription updated"); router.refresh(); }).catch(err => setMessage(err.message)).finally(() => setBusy(false)); }}>Use {plan} in local demo</button><p role="status">{message}</p></div>;
}
