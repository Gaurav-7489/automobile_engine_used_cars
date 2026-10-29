import { LEAD_STAGES, type Lead, type LeadStage } from "./domain";

/**
 * Follow-up automation: a rule turns a lead event (created, or moved to a stage) into a follow-up task on that lead.
 * Rules are deterministic and every evaluation, including skipped ones, is recorded as a run. Provider channels (WhatsApp)
 * are never sent: without a configured provider the run is recorded as held, and without consent as skipped.
 */
export type AutomationTrigger = "lead_created" | "stage_changed";
export type AutomationRule = {
  id: string; name: string; enabled: boolean; trigger: AutomationTrigger; stages: LeadStage[]; delayMinutes: number;
  taskTitle: string; priority: "normal" | "high"; channel: "internal_task" | "whatsapp"; requiresConsent: boolean; updatedAt?: string;
};
export type RunOutcome = "created" | "skipped_consent" | "skipped_provider" | "skipped_duplicate";
export type AutomationRun = { id: string; ruleId: string; ruleName: string; leadId: string; trigger: AutomationTrigger; outcome: RunOutcome; taskId?: string; detail: string; occurredAt: string };

export const OUTCOME_LABEL: Record<RunOutcome, string> = { created: "Task created", skipped_consent: "Skipped: no consent", skipped_provider: "Held: no provider connected", skipped_duplicate: "Skipped: already created" };
export const TRIGGER_LABEL: Record<AutomationTrigger, string> = { lead_created: "A lead is added", stage_changed: "A lead moves to a stage" };

export type RuleInput = Partial<Record<keyof Omit<AutomationRule, "id" | "updatedAt">, unknown>>;

/** Validates a rule from the browser; unknown properties are dropped and every problem is reported by field. */
export function validateRule(input: RuleInput): { rule: Omit<AutomationRule, "id" | "updatedAt"> } | { fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const name = String(input.name ?? "").trim(), taskTitle = String(input.taskTitle ?? "").trim();
  if (name.length < 3 || name.length > 80) fields.name = "Name the rule in 3 to 80 characters.";
  if (taskTitle.length < 3 || taskTitle.length > 120) fields.taskTitle = "Describe the task in 3 to 120 characters.";
  const trigger = input.trigger;
  if (trigger !== "lead_created" && trigger !== "stage_changed") fields.trigger = "Choose when the rule runs.";
  const stages = Array.isArray(input.stages) ? input.stages : [];
  if (stages.some((s) => !LEAD_STAGES.includes(s as LeadStage))) fields.stages = "Choose valid stages.";
  if (trigger === "stage_changed" && !stages.length) fields.stages = "Choose at least one stage for this rule.";
  const delay = Number(input.delayMinutes);
  if (!Number.isInteger(delay) || delay < 0 || delay > 60 * 24 * 30) fields.delayMinutes = "Enter whole minutes from 0 to 43,200.";
  const priority = input.priority === "high" ? "high" : input.priority === "normal" || input.priority === undefined ? "normal" : null;
  if (!priority) fields.priority = "Choose normal or high.";
  const channel = input.channel === "whatsapp" ? "whatsapp" : input.channel === "internal_task" || input.channel === undefined ? "internal_task" : null;
  if (!channel) fields.channel = "Choose a channel.";
  if (Object.keys(fields).length) return { fields };
  return { rule: { name, enabled: input.enabled !== false, trigger: trigger as AutomationTrigger, stages: trigger === "stage_changed" ? (stages as LeadStage[]) : [], delayMinutes: delay, taskTitle, priority: priority!, channel: channel!, requiresConsent: channel === "whatsapp" ? input.requiresConsent !== false : false } };
}

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export const newRuleId = () => uid("AR");

/** Evaluates every matching rule for one lead event. `alreadyCreated` holds "ruleId|leadId|trigger" keys for tasks created before. */
export function evaluateLead(lead: Lead, trigger: AutomationTrigger, rules: readonly AutomationRule[], alreadyCreated: ReadonlySet<string>, at: Date): { tasks: Lead["tasks"]; runs: AutomationRun[] } {
  const tasks: Lead["tasks"] = [], runs: AutomationRun[] = [], made = new Set(alreadyCreated);
  for (const rule of rules) {
    if (!rule.enabled || rule.trigger !== trigger || (rule.stages.length && !rule.stages.includes(lead.stage))) continue;
    const key = `${rule.id}|${lead.id}|${trigger}`;
    const run = (outcome: RunOutcome, detail: string, taskId?: string) => runs.push({ id: uid("AX"), ruleId: rule.id, ruleName: rule.name, leadId: lead.id, trigger, outcome, taskId, detail, occurredAt: at.toISOString() });
    if (made.has(key)) { run("skipped_duplicate", "This rule already created its task for this lead."); continue; }
    if (rule.channel === "whatsapp") {
      if (rule.requiresConsent && !lead.consent.marketing) run("skipped_consent", "The lead has not consented to marketing messages.");
      else run("skipped_provider", "No messaging provider is connected, so nothing was sent.");
      continue;
    }
    const taskId = uid("t");
    tasks.push({ id: taskId, title: rule.priority === "high" ? `${rule.taskTitle} (high priority)` : rule.taskTitle, dueAt: new Date(at.getTime() + rule.delayMinutes * 60_000).toISOString(), done: false });
    made.add(key);
    run("created", `Task due in ${rule.delayMinutes} minutes.`, taskId);
  }
  return { tasks, runs };
}
