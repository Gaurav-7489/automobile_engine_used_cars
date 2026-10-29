import type { Lead } from "../domain";
import type { WorkspaceState } from "../state";
import { evaluateLead, newRuleId, type AutomationRule, type AutomationRun, type AutomationTrigger, type RunOutcome } from "../automation";
import type { SqlClient } from "./db";

type Row = Record<string, unknown>;

export async function listRules(c: SqlClient, tenantId: string): Promise<AutomationRule[]> {
  const rows = (await c.query("SELECT rule_id, payload, updated_at::text AS updated_at FROM intelligence_automation_rules WHERE tenant_id = $1 ORDER BY rule_id", [tenantId])).rows as Row[];
  return rows.map((r) => ({ ...(r.payload as Omit<AutomationRule, "id">), id: String(r.rule_id), updatedAt: String(r.updated_at) }));
}

/** Creates a rule (no id) or replaces one in this dealership. Returns null when the id is not a rule of this dealership. */
export async function saveRule(c: SqlClient, tenantId: string, id: string | null, rule: Omit<AutomationRule, "id" | "updatedAt">): Promise<AutomationRule | null> {
  if (id) {
    const done = await c.query("UPDATE intelligence_automation_rules SET payload = $3, updated_at = now() WHERE tenant_id = $1 AND rule_id = $2 RETURNING rule_id", [tenantId, id, rule]);
    return done.rows.length ? { ...rule, id } : null;
  }
  const fresh = newRuleId();
  await c.query("INSERT INTO intelligence_automation_rules(tenant_id, rule_id, payload) VALUES ($1, $2, $3)", [tenantId, fresh, rule]);
  return { ...rule, id: fresh };
}

export async function deleteRule(c: SqlClient, tenantId: string, id: string): Promise<boolean> {
  return (await c.query("DELETE FROM intelligence_automation_rules WHERE tenant_id = $1 AND rule_id = $2 RETURNING rule_id", [tenantId, id])).rows.length > 0;
}

export async function recentRuns(c: SqlClient, tenantId: string, f: { ruleId?: string; outcome?: RunOutcome; page: number; size: number }): Promise<{ runs: AutomationRun[]; total: number; counts: Record<string, number> }> {
  const values: unknown[] = [tenantId];
  const where = ["tenant_id = $1"];
  if (f.ruleId) { values.push(f.ruleId); where.push(`rule_id = $${values.length}`); }
  if (f.outcome) { values.push(f.outcome); where.push(`outcome = $${values.length}`); }
  values.push(f.size, (f.page - 1) * f.size);
  const rows = (await c.query(`SELECT run_id, rule_id, rule_name, lead_id, trigger, outcome, task_id, detail, occurred_at::text AS at, count(*) OVER () AS total FROM intelligence_automation_runs WHERE ${where.join(" AND ")} ORDER BY occurred_at DESC, run_id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values)).rows as Row[];
  const counts = Object.fromEntries((await c.query("SELECT outcome, count(*)::int AS n FROM intelligence_automation_runs WHERE tenant_id = $1 GROUP BY outcome", [tenantId])).rows.map((r: Row) => [String(r.outcome), Number(r.n)]));
  return {
    runs: rows.map((r) => ({ id: String(r.run_id), ruleId: String(r.rule_id), ruleName: String(r.rule_name), leadId: String(r.lead_id), trigger: r.trigger as AutomationTrigger, outcome: r.outcome as RunOutcome, taskId: r.task_id ? String(r.task_id) : undefined, detail: String(r.detail), occurredAt: String(r.at) })),
    total: rows.length ? Number(rows[0].total) : 0, counts,
  };
}

/**
 * Applies enabled rules to the leads a batch of commands created or moved, inside the same transaction. The returned state
 * carries the new tasks (and a system note on each lead) so they are saved with the command; runs are recorded after saving.
 */
export async function automate(c: SqlClient, tenantId: string, before: WorkspaceState, after: WorkspaceState, at = new Date()): Promise<{ state: WorkspaceState; runs: AutomationRun[] }> {
  const prior = new Map(before.leads.map((l) => [l.id, l.stage]));
  const events: { lead: Lead; trigger: AutomationTrigger }[] = [];
  for (const lead of after.leads) {
    if (!prior.has(lead.id)) events.push({ lead, trigger: "lead_created" });
    else if (prior.get(lead.id) !== lead.stage) events.push({ lead, trigger: "stage_changed" });
  }
  if (!events.length) return { state: after, runs: [] };
  const rules = (await listRules(c, tenantId)).filter((r) => r.enabled);
  if (!rules.length) return { state: after, runs: [] };
  const done = (await c.query("SELECT rule_id, lead_id, trigger FROM intelligence_automation_runs WHERE tenant_id = $1 AND outcome = 'created' AND lead_id = ANY($2::text[])", [tenantId, events.map((e) => e.lead.id)])).rows as Row[];
  const created = new Set(done.map((r) => `${r.rule_id}|${r.lead_id}|${r.trigger}`));
  const runs: AutomationRun[] = [], updated = new Map<string, Lead>();
  for (const { lead, trigger } of events) {
    const current = updated.get(lead.id) ?? lead;
    const result = evaluateLead(current, trigger, rules, created, at);
    for (const run of result.runs) if (run.outcome === "created") created.add(`${run.ruleId}|${run.leadId}|${run.trigger}`);
    runs.push(...result.runs);
    if (!result.runs.length) continue;
    const notes = result.runs.map((r, i) => ({ id: `i-${lead.id}-auto-${r.id}`, at: at.toISOString(), type: "System" as const, actor: "Automation", detail: `${r.ruleName}: ${r.detail}`, outcome: undefined, order: i }));
    updated.set(lead.id, { ...current, tasks: [...result.tasks, ...current.tasks], interactions: [...notes.map(({ order: _order, ...n }) => n), ...current.interactions] });
  }
  return { state: { ...after, leads: after.leads.map((l) => updated.get(l.id) ?? l) }, runs };
}

export async function recordRuns(c: SqlClient, tenantId: string, runs: AutomationRun[]): Promise<void> {
  for (const r of runs) {
    await c.query("INSERT INTO intelligence_automation_runs(tenant_id, run_id, rule_id, rule_name, lead_id, trigger, outcome, task_id, detail, occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [tenantId, r.id, r.ruleId, r.ruleName, r.leadId, r.trigger, r.outcome, r.taskId ?? null, r.detail, r.occurredAt]);
  }
}

/** Rule changes are made outside the command pipeline, so they write their own dealership audit entry. */
export async function auditRuleChange(c: SqlClient, tenantId: string, actor: string, action: string, target: string, detail: string): Promise<void> {
  const id = `AU-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const at = new Date().toISOString();
  await c.query("INSERT INTO intelligence_documents(tenant_id, collection, id, payload, updated_at) VALUES ($1, 'audit', $2, $3, $4)", [tenantId, id, { id, at, actor, action, target, detail }, at]);
}
