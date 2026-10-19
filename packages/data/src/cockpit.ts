import type { CommercePlan, DealerSubscription, LeadStage } from "@vandlabs/contracts";
import { commercePlans } from "@vandlabs/contracts";
import { capitalReport } from "./capital";
import { bandLabels, deadStockReport, type DeadStockAccess } from "./dead-stock";
import { entitlementState, aiUsageKey } from "./entitlements";
import type { Snapshot } from "./index";

// Dealer cockpit: one deterministic pass over the records the caller is already allowed to see.
// Nothing here estimates, forecasts or invents: every figure is a count or sum of recorded data,
// withheld evidence is reported as unavailable (null), and every action names the record behind it.

export const cockpitPolicy = {
  /** A new enquiry should be answered within this many hours. */
  firstResponseHours: 4,
  /** Waiting this long turns a high-priority item critical. */
  criticalHours: 24,
  /** A scheduled visit this many hours in the past needs its outcome recorded. */
  staleAppointmentHours: 2,
  /** Plan meters at or above this ratio raise an alert. */
  planWarnRatio: 0.9,
} as const;

export const openStages: readonly LeadStage[] = ["new", "contacted", "qualified", "appointment", "visited", "test_drive", "negotiation"];
export const stageLabels: Record<LeadStage, string> = { new: "New", contacted: "Contacted", qualified: "Qualified", appointment: "Appointment", visited: "Visited", test_drive: "Test drive", negotiation: "Negotiation", won: "Won", lost: "Lost", nurture: "Nurture" };

export type ActionSeverity = "critical" | "high" | "medium" | "info";
export type ActionCategory = "follow_up" | "task" | "appointment" | "stock" | "costs" | "plan";
export interface CockpitAction {
  id: string;
  severity: ActionSeverity;
  category: ActionCategory;
  title: string;
  detail: string;
  /** The recorded facts that triggered the action. */
  evidence: string[];
  /** Path inside the Command Center app (its /command base path is added by next/link). */
  href: string;
  /** Present when the item can be resolved in place through an existing, authorized API. */
  resolve?: { kind: "complete_task"; taskId: string; version: number };
  /** Hours waiting (follow-ups, tasks, appointments) or days in stock (stock). */
  waiting?: { value: number; unit: "hours" | "days" };
}
export interface PlanMeter { key: "inventory" | "ai" | "api"; label: string; used: number; limit: number }
export interface CockpitAccess { capital: boolean; leads: boolean }
export type CockpitSnapshot = Pick<Snapshot, "leads" | "tasks" | "appointments" | "vehicles" | "events" | "costs" | "sales" | "inventoryHistory">;

const HOUR = 3_600_000, DAY = 86_400_000;
const rank: Record<ActionSeverity, number> = { critical: 0, high: 1, medium: 2, info: 3 };
const indiaDay = (time: number) => Math.floor((time + 19_800_000) / DAY);
const ageText = (hours: number) => hours >= 48 ? `${Math.floor(hours / 24)} days` : `${Math.floor(hours)} hours`;
const istStamp = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(new Date(iso)) + " IST";
const label = (v: { year: number; make: string; model: string }) => `${v.year} ${v.make} ${v.model}`.trim();

/** Meters for one tenant, for the plan-usage strip and capacity alerts. */
export function planMeters(subscription: DealerSubscription | null | undefined, usage: Record<string, number>, unsoldVehicles: number, now: Date): { plan: CommercePlan; state: "active" | "inactive" | "unsubscribed"; meters: PlanMeter[] } {
  const state = entitlementState(subscription, now), month = now.toISOString().slice(0, 7);
  return { plan: state.plan, state: state.status, meters: [
    { key: "inventory", label: "Unsold vehicles", used: unsoldVehicles, limit: state.entitlements.inventory },
    { key: "ai", label: "AI requests this month", used: usage[aiUsageKey(now)] ?? 0, limit: state.entitlements.aiRequestsPerMonth },
    { key: "api", label: "API requests this month", used: usage[`month:${month}`] ?? 0, limit: commercePlans[state.plan].monthlyRequests },
  ] };
}

export function buildCockpit(snapshot: CockpitSnapshot, access: CockpitAccess, now: Date, plan?: ReturnType<typeof planMeters>) {
  const t = now.getTime();
  const vehicles = snapshot.vehicles, byId = new Map(vehicles.map(v => [v.id, v]));
  const activeVehicles = vehicles.filter(v => v.availabilityStatus !== "sold");

  const costs = access.capital && snapshot.costs ? snapshot.costs : undefined;
  const capital = costs ? capitalReport(vehicles, costs, snapshot.sales ?? [], now) : null;
  const dead = deadStockReport(snapshot, now, undefined, { enquiries: access.leads ? "all" : "unavailable", capital: Boolean(costs) } satisfies DeadStockAccess);

  // ---- KPIs -------------------------------------------------------------------------------
  const inventory = {
    active: activeVehicles.length,
    available: vehicles.filter(v => v.availabilityStatus === "available").length,
    reserved: vehicles.filter(v => v.availabilityStatus === "reserved").length,
    sold: vehicles.length - activeVehicles.length,
    published: activeVehicles.filter(v => v.publishStatus === "published").length,
    unpublished: activeVehicles.filter(v => v.publishStatus !== "published").length,
    aging: dead.bands.map(b => ({ label: b.label, vehicles: b.vehicles, recordedCapital: b.recordedCapital, costCoverage: b.costCoverage })),
    unknownAge: dead.unknownAge,
    bandLabels: bandLabels(),
  };

  let profit: { realizedContribution: number; sales: number; revenue: number; marginPercent: number | null } | null = null;
  if (capital) {
    const sold = capital.rows.filter(r => r.recordedContribution !== null);
    const saleOf = (vehicleId: string) => (snapshot.sales ?? []).find(s => s.vehicleId === vehicleId);
    const revenue = sold.reduce((n, r) => n + Math.round((saleOf(r.vehicleId)?.amount ?? 0) * 100), 0) / 100;
    profit = { realizedContribution: capital.realizedContribution, sales: sold.length, revenue, marginPercent: revenue > 0 ? Math.round(capital.realizedContribution / revenue * 10000) / 100 : null };
  }

  let pipeline: null | { stages: { stage: LeadStage; label: string; count: number }[]; open: number; uncontacted: number; won: number; lost: number; nurture: number; winRatePercent: number | null; askingValue: number; enquiredVehicles: number; appointmentsToday: number } = null;
  if (access.leads) {
    const leads = snapshot.leads;
    const count = (s: LeadStage) => leads.filter(l => l.stage === s).length;
    const open = leads.filter(l => !["won", "lost"].includes(l.stage));
    const won = count("won"), lost = count("lost");
    const enquired = new Map<string, number>();
    for (const l of open) if (l.vehicleId && byId.has(l.vehicleId)) enquired.set(l.vehicleId, byId.get(l.vehicleId)!.price);
    pipeline = {
      stages: openStages.map(stage => ({ stage, label: stageLabels[stage], count: count(stage) })),
      open: open.length, uncontacted: count("new"), won, lost, nurture: count("nurture"),
      winRatePercent: won + lost > 0 ? Math.round(won / (won + lost) * 1000) / 10 : null,
      askingValue: [...enquired.values()].reduce((n, v) => n + v, 0), enquiredVehicles: enquired.size,
      appointmentsToday: snapshot.appointments.filter(a => a.status === "scheduled" && indiaDay(Date.parse(a.scheduledAt)) === indiaDay(t)).length,
    };
  }

  // ---- Actions ----------------------------------------------------------------------------
  const actions: CockpitAction[] = [];
  const leadById = new Map(snapshot.leads.map(l => [l.id, l]));
  if (access.leads) {
    for (const lead of snapshot.leads) {
      if (lead.stage !== "new") continue;
      const hours = (t - Date.parse(lead.createdAt)) / HOUR;
      if (!(hours >= cockpitPolicy.firstResponseHours)) continue;
      const vehicle = lead.vehicleId ? byId.get(lead.vehicleId) : undefined;
      actions.push({ id: `lead:${lead.id}:first-response`, severity: hours >= cockpitPolicy.criticalHours ? "critical" : "high", category: "follow_up",
        title: `${lead.name} is waiting for a first response`, detail: `${vehicle ? label(vehicle) : "General enquiry"} · ${lead.assignedTo ? `assigned to ${lead.assignedTo}` : "unassigned"} · via ${lead.source}`,
        evidence: [`Enquiry received ${ageText(hours)} ago`, `Target first response: ${cockpitPolicy.firstResponseHours} hours`], href: `/leads/${lead.id}`, waiting: { value: Math.floor(hours), unit: "hours" } });
    }
    for (const task of snapshot.tasks) {
      if (task.completed) continue;
      const overdue = (t - Date.parse(task.dueAt)) / HOUR;
      if (!(overdue > 0)) continue;
      const lead = leadById.get(task.leadId);
      // The lead's own first-response action already carries this item; don't list it twice.
      if (lead?.stage === "new" && (t - Date.parse(lead.createdAt)) / HOUR >= cockpitPolicy.firstResponseHours && /first response/i.test(task.title)) continue;
      actions.push({ id: `task:${task.id}`, severity: overdue >= cockpitPolicy.criticalHours ? "critical" : "high", category: "task",
        title: task.title, detail: `${lead?.name ?? "Lead"} · owner ${task.owner}${task.priority === "high" ? " · high priority" : ""}`,
        evidence: [`Due ${istStamp(task.dueAt)}`, `Overdue by ${ageText(overdue)}`], href: `/leads/${task.leadId}`,
        resolve: { kind: "complete_task", taskId: task.id, version: task.version ?? 0 }, waiting: { value: Math.floor(overdue), unit: "hours" } });
    }
    for (const appointment of snapshot.appointments) {
      if (appointment.status !== "scheduled") continue;
      const past = (t - Date.parse(appointment.scheduledAt)) / HOUR;
      if (!(past >= cockpitPolicy.staleAppointmentHours)) continue;
      const lead = leadById.get(appointment.leadId), vehicle = appointment.vehicleId ? byId.get(appointment.vehicleId) : undefined;
      actions.push({ id: `appointment:${appointment.id}`, severity: "high", category: "appointment",
        title: `Record the outcome of ${appointment.type === "test_drive" ? "the test drive" : "the visit"} with ${lead?.name ?? "the customer"}`,
        detail: `${vehicle ? label(vehicle) : "Vehicle not specified"} · scheduled ${istStamp(appointment.scheduledAt)}`,
        evidence: [`Still marked scheduled ${ageText(past)} after its start time`], href: `/leads/${appointment.leadId}`, waiting: { value: Math.floor(past), unit: "hours" } });
    }
  }
  const priorityOrder = ["inspect", "publish", "promote", "review_price", "follow_up"] as const;
  const stockTitles = { inspect: "Complete the listing record", publish: "Publish this aged vehicle", promote: "Promote this vehicle", review_price: "Review the asking price", follow_up: "Follow up open enquiries" } as const;
  for (const row of dead.vehicles) {
    if (!row.recommendations.length) continue;
    const top = [...row.recommendations].sort((a, b) => priorityOrder.indexOf(a.action) - priorityOrder.indexOf(b.action))[0];
    const oldest = row.band === dead.bands.at(-1)?.label;
    actions.push({ id: `stock:${row.vehicleId}`, severity: oldest || row.openLeads ? "high" : "medium", category: "stock",
      title: `${stockTitles[top.action]}: ${row.label}`, detail: `${row.stockId} · ${row.ageDays ?? "unknown"} days in stock${row.capitalLocked !== null ? ` · ₹${row.capitalLocked.toLocaleString("en-IN")} recorded capital` : ""}`,
      evidence: row.recommendations.flatMap(r => r.evidence), href: `/inventory#vehicle-${row.vehicleId}`, ...(row.ageDays !== null ? { waiting: { value: row.ageDays, unit: "days" as const } } : {}) });
  }
  if (capital && capital.uncoveredVehicles > 0) {
    actions.push({ id: "costs:coverage", severity: "medium", category: "costs", title: `Record costs for ${capital.uncoveredVehicles} unsold ${capital.uncoveredVehicles === 1 ? "vehicle" : "vehicles"}`,
      detail: `${capital.coveredVehicles} of ${capital.activeVehicles} unsold vehicles have a cost record`, evidence: ["Capital and profit figures exclude vehicles without cost records; they are not treated as zero."], href: "/capital" });
  }
  if (plan && plan.state === "inactive") {
    actions.push({ id: "plan:inactive", severity: "high", category: "plan", title: "Your subscription is not active", detail: "New staff, stock and paid features are blocked until it is renewed.", evidence: [`Plan: ${commercePlans[plan.plan].name}`], href: "/subscriptions" });
  }
  for (const meter of plan?.meters ?? []) {
    const ratio = meter.limit > 0 ? meter.used / meter.limit : 0;
    if (ratio >= cockpitPolicy.planWarnRatio) actions.push({ id: `plan:${meter.key}`, severity: meter.used >= meter.limit ? "high" : "info", category: "plan",
      title: `${meter.label} ${meter.used >= meter.limit ? "has reached" : "is close to"} the ${commercePlans[plan!.plan].name} limit`, detail: `${meter.used.toLocaleString("en-IN")} of ${meter.limit.toLocaleString("en-IN")} used`,
      evidence: ["Limits are enforced by the server and set by your plan."], href: "/subscriptions" });
  }
  actions.sort((a, b) => rank[a.severity] - rank[b.severity] || (b.waiting?.unit === a.waiting?.unit ? (b.waiting?.value ?? 0) - (a.waiting?.value ?? 0) : 0) || a.id.localeCompare(b.id));

  return {
    version: "cockpit-v1", asOf: now.toISOString(), inventory, capital: capital && {
      recorded: capital.recordedCapital, aged90: capital.agedCapital, covered: capital.coveredVehicles, active: capital.activeVehicles, uncovered: capital.uncoveredVehicles, saleCostCoverage: capital.saleCostCoverage,
    }, profit, pipeline, actions,
    counts: { critical: actions.filter(a => a.severity === "critical").length, high: actions.filter(a => a.severity === "high").length, total: actions.length },
    plan: plan ?? null,
  };
}
export type Cockpit = ReturnType<typeof buildCockpit>;
