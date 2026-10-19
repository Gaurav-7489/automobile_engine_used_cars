import type { Sale, StockCost, Vehicle } from "@vandlabs/contracts";
import { capitalReport } from "./capital";

// Capital and profit intelligence over the dealer's own recorded costs, asking prices and sales.
// Every figure is a sum or difference of recorded values. Missing costs make a vehicle uncovered,
// never zero, and the insights say what they are built from so staff can check them.

export const capitalPolicy = {
  /** Aged capital at or above this share of recorded capital is worth watching; at risk above the second. */
  agedShareWatch: 0.25,
  agedShareRisk: 0.5,
  /** How many vehicles an insight lists as evidence. */
  evidenceLimit: 3,
} as const;

export type InsightTone = "risk" | "watch" | "info" | "good";
export interface Insight { id: string; tone: InsightTone; title: string; body: string; evidence: string[]; href?: string }
export interface SpreadRow { vehicleId: string; stockId: string; label: string; askingPrice: number; costBasis: number; spread: number; spreadPercent: number | null; holdingEstimate: number | null; ageDays: number | null }
export interface SaleRow { vehicleId: string; stockId: string; label: string; amount: number; costBasis: number; contribution: number; marginPercent: number | null }
export interface CostMix { purchase: number; reconditioning: number; transfer: number; other: number; total: number; vehicles: number }

const inr = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString("en-IN")}`;
const signed = (n: number) => `${n < 0 ? "−" : "+"}${inr(n)}`;
const label = (v: Vehicle) => `${v.year} ${v.make} ${v.model}`.trim();
const cents = (values: number[]) => values.reduce((n, v) => n + Math.round(v * 100), 0) / 100;

export function capitalInsights(vehicles: Vehicle[], costs: StockCost[], sales: Sale[], asOf = new Date()) {
  const report = capitalReport(vehicles, costs, sales, asOf);
  const byVehicle = new Map(vehicles.map((v, i) => [v.id, { vehicle: v, row: report.rows[i] }]));
  const costOf = (vehicleId: string, tenantId: string) => costs.find(c => c.vehicleId === vehicleId && c.tenantId === tenantId);

  const activeCosted = report.rows.filter(r => r.active && r.coverage === "recorded");
  const spreads: SpreadRow[] = activeCosted.map(r => {
    const { vehicle } = byVehicle.get(r.vehicleId)!;
    const spread = Math.round((vehicle.price - r.costBasis!) * 100) / 100;
    return { vehicleId: vehicle.id, stockId: vehicle.stockId, label: label(vehicle), askingPrice: vehicle.price, costBasis: r.costBasis!, spread,
      spreadPercent: r.costBasis! > 0 ? Math.round(spread / r.costBasis! * 1000) / 10 : null, holdingEstimate: r.holdingEstimate, ageDays: r.ageDays };
  }).sort((a, b) => a.spread - b.spread || a.stockId.localeCompare(b.stockId));

  const saleRows: SaleRow[] = report.rows.filter(r => r.recordedContribution !== null).map(r => {
    const { vehicle } = byVehicle.get(r.vehicleId)!;
    const sale = sales.find(s => s.vehicleId === vehicle.id && s.tenantId === vehicle.tenantId)!;
    return { vehicleId: vehicle.id, stockId: vehicle.stockId, label: label(vehicle), amount: sale.amount, costBasis: r.costBasis!, contribution: r.recordedContribution!, marginPercent: r.recordedMarginPercent };
  }).sort((a, b) => a.contribution - b.contribution);

  let costMix: CostMix | null = null;
  if (activeCosted.length) {
    const recorded = activeCosted.map(r => costOf(r.vehicleId, byVehicle.get(r.vehicleId)!.vehicle.tenantId)!);
    const mix = { purchase: cents(recorded.map(c => c.purchasePrice)), reconditioning: cents(recorded.map(c => c.reconditioningCost)), transfer: cents(recorded.map(c => c.transferCost)), other: cents(recorded.map(c => c.otherCost)) };
    costMix = { ...mix, total: cents(Object.values(mix)), vehicles: recorded.length };
  }
  const holdingRows = activeCosted.filter(r => r.holdingEstimate !== null);
  const holding = holdingRows.length ? { accrued: cents(holdingRows.map(r => r.holdingEstimate!)), vehicles: holdingRows.length } : null;

  // ---- Insights: ordered risk, watch, info, good -------------------------------------------
  const insights: Insight[] = [];
  const top = <T,>(rows: T[]) => rows.slice(0, capitalPolicy.evidenceLimit);
  const below = spreads.filter(s => s.spread < 0);
  if (below.length) insights.push({ id: "below-cost", tone: "risk", title: `${below.length} ${below.length === 1 ? "vehicle is" : "vehicles are"} listed below recorded cost`,
    body: `Selling at the asking price would lose ${inr(cents(below.map(s => s.spread)))} before any holding or sale expenses. Check the price or the cost record.`,
    evidence: top(below).map(s => `${s.stockId} ${s.label}: asking ${inr(s.askingPrice)} vs cost ${inr(s.costBasis)} (${signed(s.spread)})`), href: `/inventory#vehicle-${below[0].vehicleId}` });

  const eroded = spreads.filter(s => s.spread >= 0 && s.holdingEstimate !== null && s.spread < s.holdingEstimate);
  if (eroded.length) insights.push({ id: "holding-erosion", tone: "watch", title: `Holding cost has used up the margin on ${eroded.length} ${eroded.length === 1 ? "vehicle" : "vehicles"}`,
    body: "The asking price is above cost, but your own daily holding assumption already exceeds that margin, so each extra day is a loss on paper.",
    evidence: top(eroded).map(s => `${s.stockId} ${s.label}: margin ${inr(s.spread)} vs holding so far ${inr(s.holdingEstimate!)}`), href: `/inventory#vehicle-${eroded[0].vehicleId}` });

  if (report.agedCapital > 0 && report.recordedCapital > 0) {
    const share = report.agedCapital / report.recordedCapital, pct = Math.round(share * 1000) / 10;
    const old = activeCosted.filter(r => r.ageDays !== null && r.ageDays >= 90).sort((a, b) => b.costBasis! - a.costBasis!);
    insights.push({ id: "aged-capital", tone: share >= capitalPolicy.agedShareRisk ? "risk" : share >= capitalPolicy.agedShareWatch ? "watch" : "info",
      title: `${inr(report.agedCapital)} (${pct}%) of recorded capital is in vehicles held 90+ days`,
      body: "Older stock ties up cash and tends to need a price, listing or channel decision. Age counts from the recorded acquisition date.",
      evidence: top(old).map(r => { const { vehicle } = byVehicle.get(r.vehicleId)!; return `${vehicle.stockId} ${label(vehicle)}: ${r.ageDays} days, ${inr(r.costBasis!)}`; }), href: `/inventory#vehicle-${old[0].vehicleId}` });
  }
  const lost = saleRows.filter(s => s.contribution < 0);
  if (lost.length) insights.push({ id: "loss-sales", tone: "risk", title: `${lost.length} recorded ${lost.length === 1 ? "sale" : "sales"} sold below cost`,
    body: `Together they lost ${inr(cents(lost.map(s => s.contribution)))} before unrecorded expenses. Review what drove the price.`,
    evidence: top(lost).map(s => `${s.stockId} ${s.label}: sold ${inr(s.amount)} vs cost ${inr(s.costBasis)} (${signed(s.contribution)})`) });

  if (report.uncoveredVehicles > 0) insights.push({ id: "coverage", tone: "watch", title: `Capital is understated: ${report.uncoveredVehicles} of ${report.activeVehicles} unsold vehicles have no cost record`,
    body: "Missing costs are excluded, not counted as zero, so every figure here covers only costed vehicles. Recording costs makes capital, age and margin reliable.",
    evidence: [`${report.coveredVehicles} of ${report.activeVehicles} unsold vehicles are costed`], href: "/capital#vehicle-economics" });

  if (!insights.some(i => i.tone === "risk" || i.tone === "watch")) insights.push(report.activeVehicles === 0
    ? { id: "no-stock", tone: "info", title: "There is no unsold stock to analyse", body: "Add inventory and record its costs to see capital and margin.", evidence: [] }
    : { id: "all-clear", tone: "good", title: "No cost or pricing problem found in recorded data", body: "Every unsold vehicle is costed, none is listed below cost and no margin is consumed by holding cost.", evidence: [`${report.coveredVehicles} of ${report.activeVehicles} unsold vehicles costed`] });
  const order: Record<InsightTone, number> = { risk: 0, watch: 1, info: 2, good: 3 };
  insights.sort((a, b) => order[a.tone] - order[b.tone]);

  return { report, spreads, sales: saleRows, costMix, holding, insights };
}
export type CapitalInsights = ReturnType<typeof capitalInsights>;
