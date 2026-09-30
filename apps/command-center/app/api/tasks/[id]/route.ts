import { NextResponse } from "next/server";
import type { LeadActivity } from "@vandlabs/contracts";
import { leads as seededLeads, tasks as seededTasks, tenantConfig } from "@vandlabs/demo-data";
import {
  mergeRuntimeLeads,
  mergeRuntimeTasks,
  persistRuntimeLeadActivities,
  persistRuntimeTask,
} from "@vandlabs/demo-data/runtime";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const task = mergeRuntimeTasks(seededTasks).find((item) => item.id === id);
  const lead = task
    ? mergeRuntimeLeads(seededLeads).find((item) => item.id === task.leadId)
    : undefined;

  if (!task || !lead || lead.tenantId !== tenantConfig.tenantId) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  const body = (await request.json()) as { completed?: boolean };
  if (typeof body.completed !== "boolean") {
    return NextResponse.json({ error: "Completed state is required." }, { status: 400 });
  }

  const updated = { ...task, completed: body.completed };
  const activity: LeadActivity = {
    id: crypto.randomUUID(),
    tenantId: lead.tenantId,
    leadId: lead.id,
    type: body.completed ? "follow_up_completed" : "follow_up_reopened",
    actor: "Demo operator",
    description: body.completed
      ? `Follow-up completed: ${task.title}.`
      : `Follow-up reopened: ${task.title}.`,
    occurredAt: new Date().toISOString(),
  };

  if (!persistRuntimeTask(updated) || !persistRuntimeLeadActivities([activity])) {
    return NextResponse.json({ error: "Task update could not be persisted." }, { status: 503 });
  }

  return NextResponse.json({ data: updated, activity });
}
