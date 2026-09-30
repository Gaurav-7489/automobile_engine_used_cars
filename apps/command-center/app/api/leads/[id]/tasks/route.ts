import { NextResponse } from "next/server";
import type { LeadActivity, Task } from "@vandlabs/contracts";
import { leads as seededLeads, tenantConfig } from "@vandlabs/demo-data";
import {
  mergeRuntimeLeads,
  persistRuntimeLeadActivities,
  persistRuntimeTask,
} from "@vandlabs/demo-data/runtime";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const lead = mergeRuntimeLeads(seededLeads).find((item) => item.id === id);
  if (!lead || lead.tenantId !== tenantConfig.tenantId) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  const body = (await request.json()) as {
    title?: string;
    owner?: string;
    dueAt?: string;
    priority?: "normal" | "high";
  };
  const title = body.title?.trim();
  const owner = body.owner?.trim();
  const dueAt = body.dueAt ? new Date(body.dueAt) : null;

  if (
    !title || title.length > 160 ||
    !owner || owner.length > 100 ||
    !dueAt || Number.isNaN(dueAt.getTime()) ||
    (body.priority !== "normal" && body.priority !== "high")
  ) {
    return NextResponse.json({ error: "Invalid follow-up." }, { status: 400 });
  }

  const task: Task = {
    id: crypto.randomUUID(),
    leadId: lead.id,
    title,
    owner,
    dueAt: dueAt.toISOString(),
    completed: false,
    priority: body.priority,
  };
  const activity: LeadActivity = {
    id: crypto.randomUUID(),
    tenantId: lead.tenantId,
    leadId: lead.id,
    type: "follow_up_created",
    actor: "Demo operator",
    description: `Follow-up scheduled for ${owner}.`,
    occurredAt: new Date().toISOString(),
  };

  if (!persistRuntimeTask(task) || !persistRuntimeLeadActivities([activity])) {
    return NextResponse.json({ error: "Follow-up could not be persisted." }, { status: 503 });
  }

  return NextResponse.json({ data: task, activity }, { status: 201 });
}
