"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TaskStatusButton({
  taskId,
  title,
  completed,
}: {
  taskId: string;
  title: string;
  completed: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const action = completed ? "Reopen" : "Complete";

  async function updateStatus() {
    setSaving(true);
    try {
      const response = await fetch(`/command/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ completed: !completed }),
      });
      if (!response.ok) throw new Error("Task update failed");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      className="task-action"
      aria-label={`${action} ${title}`}
      disabled={saving}
      onClick={updateStatus}
    >
      {saving ? "Saving..." : action}
    </button>
  );
}
