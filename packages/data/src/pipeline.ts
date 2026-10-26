import type { Appointment, Lead, LeadActivity, LeadStage, Task, Vehicle } from "@vandlabs/contracts";
import { cockpitPolicy, openStages, stageLabels } from "./cockpit";

// The sales board over the dealership's own leads, tasks and visits. Every flag is a plain rule over
// recorded timestamps; nothing scores or ranks a buyer's likelihood to purchase.

export const pipelinePolicy = {
  /** An open lead that has sat in one stage this many days is stale. */
  staleDays: 7,
  /** Leads shown per column before the rest are counted, so a large pipeline stays readable. */
  columnLimit: 25,
} as const;

export type Attention = "first_response_overdue" | "task_overdue" | "no_next_step" | "stale";
export interface PipelineCard {
  leadId: string; name: string; stage: LeadStage; version: number;
  vehicle: string | null; askingPrice: number | null;
  owner: string | null; source: string; intent: string;
  daysInStage: number; waitingHours: number | null;
  next: { kind: "task" | "visit"; title: string; at: string; overdue: boolean } | null;
  attention: Attention[];
}
export interface PipelineColumn { stage: LeadStage; label: string; total: number; shown: number; askingValue: number; cards: PipelineCard[] }
export interface PipelineInput { leads: Lead[]; tasks: Task[]; appointments: Appointment[]; activities: LeadActivity[]; vehicles: Vehicle[] }
export interface PipelineFilter { owner?: string; attention?: boolean }

const HOUR = 3_600_000, DAY = 24 * HOUR;
const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildPipeline(input: PipelineInput, now = new Date(), filter: PipelineFilter = {}) {
  const t = now.getTime();
  const vehicleOf = new Map(input.vehicles.map(v => [v.id, v]));
  const stageSince = (lead: Lead) => {
    const changes = input.activities.filter(a => a.leadId === lead.id && a.type === "stage_changed").map(a => Date.parse(a.occurredAt)).filter(Number.isFinite);
    return changes.length ? Math.max(...changes) : Date.parse(lead.createdAt);
  };
  const cardFor = (lead: Lead): PipelineCard => {
    const vehicle = lead.vehicleId ? vehicleOf.get(lead.vehicleId) : undefined;
    const since = stageSince(lead), created = Date.parse(lead.createdAt);
    const openTasks = input.tasks.filter(x => x.leadId === lead.id && !x.completed).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
    const visits = input.appointments.filter(a => a.leadId === lead.id && a.status === "scheduled").sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
    const task = openTasks[0], visit = visits[0];
    const nextTask = task ? { kind: "task" as const, title: task.title, at: task.dueAt, overdue: Date.parse(task.dueAt) < t } : null;
    const nextVisit = visit ? { kind: "visit" as const, title: visit.type === "test_drive" ? "Test drive" : "Showroom visit", at: visit.scheduledAt, overdue: false } : null;
    const next = nextTask && nextVisit ? (Date.parse(nextTask.at) <= Date.parse(nextVisit.at) ? nextTask : nextVisit) : nextTask ?? nextVisit;
    const waitingHours = lead.stage === "new" && Number.isFinite(created) ? round1((t - created) / HOUR) : null;
    const attention: Attention[] = [];
    if (waitingHours !== null && waitingHours > cockpitPolicy.firstResponseHours) attention.push("first_response_overdue");
    if (openTasks.some(x => Date.parse(x.dueAt) < t)) attention.push("task_overdue");
    if (!task && !visit) attention.push("no_next_step");
    const daysInStage = Number.isFinite(since) ? Math.max(0, round1((t - since) / DAY)) : 0;
    if (daysInStage >= pipelinePolicy.staleDays) attention.push("stale");
    return { leadId: lead.id, name: lead.name, stage: lead.stage, version: lead.version ?? 0, vehicle: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : null, askingPrice: vehicle?.price ?? null,
      owner: lead.assignedTo ?? null, source: lead.source, intent: lead.intent, daysInStage, waitingHours, next, attention };
  };

  const owners = [...new Set(input.leads.map(l => l.assignedTo).filter((o): o is string => Boolean(o)))].sort();
  const keep = (lead: Lead, card: PipelineCard) => (!filter.owner || (filter.owner === "unassigned" ? !lead.assignedTo : lead.assignedTo === filter.owner)) && (!filter.attention || card.attention.length > 0);
  const columns: PipelineColumn[] = openStages.map(stage => {
    const cards = input.leads.filter(l => l.stage === stage).map(l => [l, cardFor(l)] as const).filter(([l, c]) => keep(l, c)).map(([, c]) => c)
      .sort((a, b) => b.attention.length - a.attention.length || b.daysInStage - a.daysInStage || a.name.localeCompare(b.name));
    const priced = cards.filter(c => c.askingPrice !== null);
    return { stage, label: stageLabels[stage], total: cards.length, shown: Math.min(cards.length, pipelinePolicy.columnLimit), askingValue: priced.reduce((n, c) => n + c.askingPrice!, 0), cards: cards.slice(0, pipelinePolicy.columnLimit) };
  });
  const closed = (["won", "lost", "nurture"] as const).map(stage => ({ stage, label: stageLabels[stage], total: input.leads.filter(l => l.stage === stage).length }));
  const open = input.leads.filter(l => (openStages as readonly string[]).includes(l.stage));
  const all = open.map(cardFor);
  return {
    asOf: now.toISOString(), columns, closed, owners,
    totals: { open: open.length, needingAttention: all.filter(c => c.attention.length).length, uncontacted: all.filter(c => c.attention.includes("first_response_overdue")).length, overdueTasks: all.filter(c => c.attention.includes("task_overdue")).length, noNextStep: all.filter(c => c.attention.includes("no_next_step")).length, stale: all.filter(c => c.attention.includes("stale")).length },
  };
}
export type PipelineView = ReturnType<typeof buildPipeline>;
