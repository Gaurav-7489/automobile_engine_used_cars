import { NextResponse } from "next/server";
import {
  requireCapability,
  requireDealership,
  requireTenant,
  type LeadActivity,
  type Task,
} from "@vandlabs/contracts";
import { leads as seededLeads, tenantConfig } from "@vandlabs/demo-data";
import {
  mergeRuntimeLeads,
  persistRuntimeLeadActivities,
  persistRuntimeTask,
} from "@vandlabs/demo-data/runtime";
import { resolvePrincipal } from "../../../../../lib/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const principal = resolvePrincipal(request);
  if (!principal) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  requireCapability(principal, "task:write");

  const { id } = await params;
  const lead = mergeRuntimeLeads(seededLeads).find((item) => item.id === id);
  if (!lead || lead.tenantId !== tenantConfig.tenantId) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }
  requireTenant(principal, lead.tenantId);
  requireDealership(principal, lead.dealershipId);

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
    tenantId: lead.tenantId,
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
    actor: principal.userId,
    description: `Follow-up scheduled for ${owner}.`,
    occurredAt: new Date().toISOString(),
  };

  if (!persistRuntimeTask(task) || !persistRuntimeLeadActivities([activity])) {
    return NextResponse.json({ error: "Follow-up could not be persisted." }, { status: 503 });
  }

  return NextResponse.json({ data: task, activity }, { status: 201 });
}
