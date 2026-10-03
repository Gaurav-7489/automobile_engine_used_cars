import { NextResponse } from "next/server";
import type { LeadActivity, LeadStage } from "@vandlabs/contracts";
import { leads as seededLeads, tenantConfig } from "@vandlabs/demo-data";
import { runLeadAutomation } from "@vandlabs/demo-data/automation";
import {
  mergeRuntimeLeads,
  persistRuntimeLead,
  persistRuntimeLeadActivities,
} from "@vandlabs/demo-data/runtime";
import { runLeadAutomation } from "@vandlabs/demo-data/automation";

const stages: LeadStage[] = [
  "new",
  "contacted",
  "qualified",
  "appointment",
  "visited",
  "test_drive",
  "negotiation",
  "won",
  "lost",
  "nurture",
];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const lead = mergeRuntimeLeads(seededLeads).find((item) => item.id === id);

  if (!lead || lead.tenantId !== tenantConfig.tenantId) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  const body = (await request.json()) as {
    stage?: LeadStage;
    assignedTo?: string | null;
    notes?: string;
  };

  if (body.stage && !stages.includes(body.stage)) {
    return NextResponse.json({ error: "Invalid pipeline stage." }, { status: 400 });
  }

  const owner = body.assignedTo?.trim() || undefined;
  const notes = body.notes?.trim() || undefined;
  if ((owner?.length ?? 0) > 100 || (notes?.length ?? 0) > 2000) {
    return NextResponse.json({ error: "Lead update is too long." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const updated = {
    ...lead,
    stage: body.stage ?? lead.stage,
    assignedTo: "assignedTo" in body ? owner : lead.assignedTo,
    notes: "notes" in body ? notes : lead.notes,
    updatedAt: now,
  };

  const activity: LeadActivity[] = [];
  const addActivity = (type: LeadActivity["type"], description: string) => {
    activity.push({
      id: crypto.randomUUID(),
      tenantId: lead.tenantId,
      leadId: lead.id,
      type,
      actor: "Demo operator",
      description,
      occurredAt: now,
    });
  };

  if (updated.stage !== lead.stage) {
    addActivity("stage_changed", `Stage changed from ${lead.stage} to ${updated.stage}.`);
  }
  if (updated.assignedTo !== lead.assignedTo) {
    addActivity("assignment_changed", `Owner changed to ${updated.assignedTo ?? "Unassigned"}.`);
  }
  if (updated.notes !== lead.notes) {
    addActivity("note_updated", "Internal lead note updated.");
  }

  if (!persistRuntimeLead(updated)) {
    return NextResponse.json({ error: "Lead update could not be persisted." }, { status: 503 });
  }
  if (activity.length && !persistRuntimeLeadActivities(activity)) {
    return NextResponse.json({ error: "Lead activity could not be persisted." }, { status: 503 });
  }

  const automation =
    updated.stage !== lead.stage ? runLeadAutomation(updated, "stage_changed") : [];

  return NextResponse.json({
    data: updated,
    activity,
    automation: {
      evaluated: automation.length,
      tasksCreated: automation.filter((run) => run.outcome === "created").length,
      skippedConsent: automation.filter((run) => run.outcome === "skipped_consent").length,
      skippedDuplicate: automation.filter((run) => run.outcome === "skipped_duplicate").length,
    },
  });
}
