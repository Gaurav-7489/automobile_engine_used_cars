import type { AutomationRule, AutomationRun, Lead, Task } from "@vandlabs/contracts";
import {
  demoTransaction,
  readRuntimeAutomationRules,
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

export function evaluateLeadAutomation(lead:Lead,trigger:AutomationRule["trigger"],rules:AutomationRule[],previousRuns:AutomationRun[]) {
  const tasks:Task[]=[],runs:AutomationRun[]=[];
  for(const rule of rules.filter(r=>r.tenantId===lead.tenantId&&r.enabled&&r.trigger===trigger&&(!r.intents?.length||r.intents.includes(lead.intent))&&(!r.stages?.length||r.stages.includes(lead.stage)))) {
    const duplicate=[...previousRuns,...runs].some(r=>r.tenantId===lead.tenantId&&r.ruleId===rule.id&&r.leadId===lead.id&&r.trigger===trigger&&r.outcome==="created");
    // Provider channels stay held even when consent exists; no configured provider delivery is implied.
    const outcome:AutomationRun["outcome"]=duplicate?"skipped_duplicate":rule.channel==="whatsapp"?(rule.requiresWhatsappConsent&&!lead.consent.whatsapp?"skipped_consent":"skipped_provider"):"created";
    const task:Task|undefined=outcome==="created"?{id:crypto.randomUUID(),version:0,tenantId:lead.tenantId,leadId:lead.id,title:rule.taskTitle,owner:lead.assignedTo??rule.ownerFallback,dueAt:new Date(Date.now()+rule.delayMinutes*60000).toISOString(),completed:false,priority:rule.priority,origin:"automation",automationRuleId:rule.id}:undefined;
    if(task)tasks.push(task);
    runs.push({id:crypto.randomUUID(),tenantId:lead.tenantId,ruleId:rule.id,leadId:lead.id,trigger,outcome,taskId:task?.id,occurredAt:new Date().toISOString()});
  }
  return {tasks,runs};
}

export function runLeadAutomation(lead:Lead,trigger:AutomationRule["trigger"]):AutomationRun[] {
  return demoTransaction(state=> {
    const result=evaluateLeadAutomation(lead,trigger,getAutomationRules(lead.tenantId),state["automation-runs.json"] as AutomationRun[]);
    state["tasks.json"]=[...result.tasks,...state["tasks.json"]];state["automation-runs.json"]=[...result.runs,...state["automation-runs.json"]];return result.runs;
  });
}
