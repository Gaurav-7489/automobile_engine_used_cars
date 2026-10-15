"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { dealerAction } from "./dealer-fetch";
import type { CommercePlan } from "@vandlabs/contracts";
export function DemoPlanControl({ plan }: { plan: CommercePlan }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter(), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  return <div><button disabled={busy || pending} onClick={() => { setBusy(true); void dealerAction("demo-plan", { plan }).then(() => { setMessage("Demo subscription updated"); startTransition(() => router.refresh()); }).catch(err => setMessage(err.message)).finally(() => setBusy(false)); }}>Use {plan} in local demo</button><p role="status">{pending ? "Updating workspace…" : message}</p></div>;
}
