"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TaskStatusButton({
  taskId,
  title,
  completed,
  version,
  closedBySaleId,
}: {
  taskId: string;
  title: string;
  completed: boolean;
  version: number;
  closedBySaleId?: string;
}) {
  const router = useRouter();
  const [error,setError]=useState("");
  const [conflict,setConflict]=useState(false);
  const [saving, setSaving] = useState(false);
  const action = completed ? "Reopen" : "Complete";

  async function updateStatus() {
    setSaving(true);setError("");
    try {
      const response = await fetch(`/command/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ completed: !completed,expectedVersion:version }),
      });
      if (!response.ok) {if(response.status===409)setConflict(true);throw new Error(response.status===409?"Follow-up changed or was closed by a sale. Reload and review.":"Could not update follow-up.");}
      router.refresh();
    } catch(error) {setError(error instanceof Error?error.message:"Could not update follow-up.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <><button
      type="button"
      className="task-action"
      aria-label={`${closedBySaleId?"Closed by sale":action} ${title}`}
      disabled={saving||conflict||!!closedBySaleId}
      onClick={updateStatus}
    >
      {closedBySaleId?"Closed by sale":saving ? "Saving..." : action}
    </button>{error?<span role="alert">{error}</span>:null}{conflict?<button type="button" onClick={()=>window.location.reload()}>Reload current follow-ups</button>:null}</>
  );
}
