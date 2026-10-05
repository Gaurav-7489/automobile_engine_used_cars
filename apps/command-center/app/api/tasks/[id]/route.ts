import { NextResponse } from "next/server";
import { requireCapability, type LeadActivity } from "@vandlabs/contracts";
import { accessError, requireLeadAccess } from "@vandlabs/server-auth";
import { resolvePrincipal } from "../../../../lib/auth";
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
  try {
    const principal = await resolvePrincipal(request);
    requireCapability(principal, "task:write");
    const { id } = await params;
    const task = mergeRuntimeTasks(seededTasks).find((item) => item.id === id);
    const lead = task
      ? mergeRuntimeLeads(seededLeads).find((item) => item.id === task.leadId)
      : undefined;

    if (!task || !lead || lead.tenantId !== tenantConfig.tenantId) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    requireLeadAccess(principal, lead, "task:write");
    if (task.tenantId !== lead.tenantId) {
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
      actor: principal.userId,
      description: body.completed
        ? `Follow-up completed: ${task.title}.`
        : `Follow-up reopened: ${task.title}.`,
      occurredAt: new Date().toISOString(),
    };

    if (!persistRuntimeTask(updated) || !persistRuntimeLeadActivities([activity])) {
      return NextResponse.json({ error: "Task update could not be persisted." }, { status: 503 });
    }

    return NextResponse.json({ data: updated, activity });
  } catch (error) {
    const failure = accessError(error);
    if (failure) return NextResponse.json({ error: failure.message }, { status: failure.status });
    throw error;
  }
}
