import type { Alert, Lead, Sale, Vehicle } from "./domain";
import { ALL_BRANCHES } from "./fixtures/branches";

import { AGE_BUCKETS, ageBucket, isRealized, realizedMetrics, realizedProfit, stockAgeDays, stockMetrics, type AgeBucketKey } from "./finance";
import { daysBetween, monthKey } from "./format";
import type { WorkspaceState } from "./state";
import { getMonths, SNAPSHOT_AT } from "./time";

/** Branch scope: "All permitted branches" never means every tenant branch. */
export function resolveScope(state: WorkspaceState, permitted: string[], param: string | null | undefined): { ids: string[]; value: string; label: string } {
  const allowed = state.branches.filter((b) => permitted.includes(b.id));
  if (param === ALL_BRANCHES && allowed.length > 1) return { ids: allowed.map((b) => b.id), value: ALL_BRANCHES, label: "All permitted branches" };
  const chosen = allowed.find((b) => b.id === param) ?? allowed.find((b) => b.isDefault) ?? allowed[0];
  return { ids: chosen ? [chosen.id] : [], value: chosen?.id ?? "", label: chosen?.name ?? "No branch" };
}

export const inScope = <T extends { branchId: string }>(items: readonly T[], ids: readonly string[]): T[] => items.filter((item) => ids.includes(item.branchId));

export function stockFor(state: WorkspaceState, ids: string[]): Vehicle[] {
  return inScope(state.vehicles, ids);
}

export function unsold(stock: readonly Vehicle[]): Vehicle[] {
  return stock.filter((v) => v.status !== "sold" && v.status !== "archived");
}

export function ageOf(v: Vehicle): number {
  return stockAgeDays(v, SNAPSHOT_AT);
}

export function overviewModel(state: WorkspaceState, ids: string[]) {
  const stock = stockFor(state, ids);
  const metrics = stockMetrics(stock, SNAPSHOT_AT);
  const events = inScope(state.events, ids);
  const movement = getMonths().map((month) => ({
    month,
    acquired: events.filter((e) => e.type === "acquired" && monthKey(e.at) === month).length,
    sold: events.filter((e) => e.type === "sold" && monthKey(e.at) === month).length,
  }));
  return { metrics, movement, hasStock: stock.length > 0 };
}

export function eventsForMonth(state: WorkspaceState, ids: string[], month: string, type?: "acquired" | "sold") {
  return inScope(state.events, ids).filter((e) => monthKey(e.at) === month && (!type || e.type === type));
}

export function ageBucketOf(v: Vehicle): AgeBucketKey {
  return ageBucket(ageOf(v));
}

export function ageSummary(stock: readonly Vehicle[]) {
  const metrics = stockMetrics(stock, SNAPSHOT_AT);
  return AGE_BUCKETS.map((b) => ({ key: b.key, label: b.label, available: metrics.availableByAge[b.key], capital: metrics.capitalByAge[b.key] }));
}

export function salesFor(state: WorkspaceState, ids: string[]): Sale[] {
  return inScope(state.sales, ids);
}

export function monthlyProfit(sales: readonly Sale[]): { month: string; profit: number; count: number }[] {
  return getMonths().map((month) => {
    const rows = sales.filter((s) => isRealized(s) && monthKey(s.closedAt) === month);
    return { month, count: rows.length, profit: rows.reduce((a, s) => a + realizedProfit(s), 0) };
  });
}

export function daysToSale(state: WorkspaceState, sale: Sale): number | null {
  const vehicle = state.vehicles.find((v) => v.id === sale.vehicleId);
  // Historical sample vehicles carry a deterministic acquisition date; days-to-sale is measured acquisition → sale-close.
  return vehicle ? daysBetween(vehicle.acquiredAt, sale.closedAt) : null;
}

export function capitalModel(state: WorkspaceState, ids: string[]) {
  const stock = stockFor(state, ids);
  const sales = salesFor(state, ids);
  const metrics = stockMetrics(stock, SNAPSHOT_AT);
  const realized = realizedMetrics(sales, (s) => daysToSale(state, s));
  return { stock, sales, metrics, realized, monthly: monthlyProfit(sales), ageRows: AGE_BUCKETS.map((b) => ({ key: b.key, label: b.label.replace(" days", "d"), capital: metrics.capitalByAge[b.key] })) };
}

export function leadsFor(state: WorkspaceState, ids: string[]): Lead[] {
  return inScope(state.leads, ids);
}

export function alertsFor(state: WorkspaceState, ids: string[]): Alert[] {
  return inScope(state.alerts, ids);
}

export type AlertCounts = { critical: number; dueToday: number; overdue: number; waiting: number; open: number };

/** Counts are distinct alerts matching the current scope. */
export function alertCounts(alerts: readonly Alert[]): AlertCounts {
  const open = alerts.filter((a) => a.status === "Open");
  return {
    open: open.length,
    critical: open.filter((a) => a.severity === "Critical").length,
    dueToday: open.filter((a) => a.severity === "Due today" || (a.dueLabel === "Today" && a.severity === "Warning")).length,
    overdue: open.filter((a) => a.severity === "Overdue").length,
    waiting: open.filter((a) => a.waiting).length,
  };
}

const SEVERITY_RANK: Record<Alert["severity"], number> = { Critical: 0, Warning: 1, "Due today": 2, Overdue: 3, Info: 4 };

export function sortAlerts(alerts: readonly Alert[]): Alert[] {
  return [...alerts].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
}

export const REPORT_FORMULA = "v1.0";

/**
 * Funnel stages count the scoped leads currently at or beyond each stage, measured from real records. Stage history is
 * not stored per lead, so a lead that was later marked Lost or Nurture is counted only at the stage it holds now.
 */
export function funnelFor(leads: readonly Lead[]): { stage: string; count: number }[] {
  const beyond = (stages: readonly string[]) => leads.filter((l) => stages.includes(l.stage) || (stages.includes("Won") && Boolean(l.saleId))).length;
  return [
    { stage: "Enquiries", count: leads.length },
    { stage: "Qualified", count: beyond(["Qualified", "Appointment", "Visited", "Test drive", "Negotiation", "Won"]) },
    { stage: "Appointments", count: leads.filter((l) => ["Appointment", "Visited", "Test drive", "Negotiation", "Won"].includes(l.stage) || l.appointment !== undefined).length },
    { stage: "Attended", count: beyond(["Visited", "Test drive", "Negotiation", "Won"]) },
    { stage: "Sales linked", count: beyond(["Won"]) },
  ];
}

export function reportsModel(state: WorkspaceState, ids: string[]) {
  const sales = salesFor(state, ids);
  const events = inScope(state.events, ids);
  const profit = monthlyProfit(sales);
  const rows = getMonths().map((month, index) => ({
    month,
    acquired: events.filter((e) => e.type === "acquired" && monthKey(e.at) === month).length,
    sold: profit[index].count,
    realized: profit[index].profit,
  }));
  const totalAcquired = rows.reduce((a, r) => a + r.acquired, 0);
  const totalSold = rows.reduce((a, r) => a + r.sold, 0);
  const totalProfit = rows.reduce((a, r) => a + r.realized, 0);
  const funnel = funnelFor(leadsFor(state, ids));
  return { rows, totalAcquired, totalSold, totalProfit, funnel, qualified: funnel[1].count };
}
