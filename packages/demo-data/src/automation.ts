import type { AutomationRule, AutomationRun, Lead, Task } from "@vandlabs/contracts";
import {
  persistRuntimeAutomationRun,
  persistRuntimeTask,
  readRuntimeAutomationRules,
  readRuntimeAutomationRuns,
} from "./runtime";

const defaults: AutomationRule[] = [
  {
    id: "rule-first-response",
    tenantId: "tenant-apex",
    name: "New lead first response",
    enabled: true,
    trigger: "lead_created",
    delayMinutes: 15,
    taskTitle: "First response",
    ownerFallback: "Sales desk",
    priority: "high",
    channel: "internal_task",
    requiresWhatsappConsent: false,
  },
  {
    id: "rule-qualified-followup",
    tenantId: "tenant-apex",
    name: "Qualified lead follow-up",
    enabled: true,
    trigger: "stage_changed",
    stages: ["qualified"],
    delayMinutes: 120,
    taskTitle: "Qualified lead follow-up",
    ownerFallback: "Sales desk",
    priority: "normal",
    channel: "internal_task",
    requiresWhatsappConsent: false,
  },
];

export function getAutomationRules(tenantId: string) {
  const runtime = readRuntimeAutomationRules();
  const runtimeIds = new Set(runtime.map((rule) => rule.id));
  return [
    ...runtime.filter((rule) => rule.tenantId === tenantId),
    ...defaults.filter((rule) => rule.tenantId === tenantId && !runtimeIds.has(rule.id)),
  ];
}

export function runLeadAutomation(lead: Lead, trigger: AutomationRule["trigger"]): AutomationRun[] {
  const previousRuns = readRuntimeAutomationRuns();
  return getAutomationRules(lead.tenantId)
    .filter((rule) => rule.enabled && rule.trigger === trigger)
    .filter((rule) => !rule.intents?.length || rule.intents.includes(lead.intent))
    .filter((rule) => !rule.stages?.length || rule.stages.includes(lead.stage))
    .map((rule) => {
      const duplicate = previousRuns.some(
        (run) => run.ruleId === rule.id && run.leadId === lead.id && run.trigger === trigger && run.outcome === "created",
      );
      let outcome: AutomationRun["outcome"] = "created";
      let taskId: string | undefined;

      if (duplicate) {
        outcome = "skipped_duplicate";
      } else if (rule.channel === "whatsapp" && rule.requiresWhatsappConsent && !lead.consent.whatsapp) {
        outcome = "skipped_consent";
      } else {
        const task: Task = {
          id: crypto.randomUUID(),
          tenantId: lead.tenantId,
          leadId: lead.id,
          title: rule.taskTitle,
          owner: lead.assignedTo ?? rule.ownerFallback,
          dueAt: new Date(Date.now() + rule.delayMinutes * 60_000).toISOString(),
          completed: false,
          priority: rule.priority,
          origin: "automation",
          automationRuleId: rule.id,
        };
        if (persistRuntimeTask(task)) taskId = task.id;
        else outcome = "skipped_duplicate";
      }

      const run: AutomationRun = {
        id: crypto.randomUUID(),
        tenantId: lead.tenantId,
        ruleId: rule.id,
        leadId: lead.id,
        trigger,
        outcome,
        taskId,
        occurredAt: new Date().toISOString(),
      };
      persistRuntimeAutomationRun(run);
      return run;
    });
}
