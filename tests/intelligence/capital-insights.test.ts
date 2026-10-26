import { test } from "node:test";
import assert from "node:assert/strict";
import { capitalInsights, capitalPolicy } from "../../packages/data/src/capital-insights";
import { vehicles } from "../../packages/demo-data/src/index";
import type { Sale, StockCost, Vehicle } from "../../packages/contracts/src/index";

const asOf = new Date("2026-10-19T06:00:00Z"), base = vehicles[0], tenantId = base.tenantId;
const car = (id: string, price: number, extra: Partial<Vehicle> = {}): Vehicle => ({ ...base, id, stockId: id.toUpperCase(), year: 2022, make: "Maruti", model: id, price, availabilityStatus: "available", ...extra });
const cost = (vehicleId: string, acquiredOn: string, over: Partial<StockCost> = {}): StockCost => ({ tenantId, vehicleId, version: 1, currency: "INR", acquiredOn, purchasePrice: 500000, reconditioningCost: 20000, transferCost: 5000, otherCost: 0, dailyHoldingCost: null, reference: "INV", recordedBy: "o", recordedAt: "2026-10-01T00:00:00Z", ...over });
const sale = (vehicleId: string, amount: number): Sale => ({ id: `s-${vehicleId}`, tenantId, leadId: "l", vehicleId, amount, currency: "INR", soldAt: "2026-10-10T00:00:00Z", confirmedBy: "o", confirmedAt: "2026-10-10T00:00:00Z" });
const ids = (r: ReturnType<typeof capitalInsights>) => r.insights.map(i => i.id);

test("cost mix sums recorded components for unsold, costed stock only", () => {
  const r = capitalInsights([car("a", 600000), car("b", 600000), car("c", 600000, { availabilityStatus: "sold" }), car("d", 600000)],
    [cost("a", "2026-10-10"), cost("b", "2026-10-10", { purchasePrice: 400000, reconditioningCost: 0, transferCost: 10000, otherCost: 2500 }), cost("c", "2026-09-01")], [sale("c", 700000)], asOf);
  assert.deepEqual(r.costMix, { purchase: 900000, reconditioning: 20000, transfer: 15000, other: 2500, total: 937500, vehicles: 2 });
  assert.equal(capitalInsights([car("x", 1)], [], [], asOf).costMix, null, "no costs means no mix, not zeros");
});

test("asking spread is price minus cost basis, sorted worst first, and ignores uncosted vehicles", () => {
  const r = capitalInsights([car("a", 540000), car("b", 480000), car("c", 700000), car("u", 100000)], [cost("a", "2026-10-10"), cost("b", "2026-10-10"), cost("c", "2026-10-10")], [], asOf);
  assert.deepEqual(r.spreads.map(s => [s.stockId, s.spread, s.spreadPercent]), [["B", -45000, -8.6], ["A", 15000, 2.9], ["C", 175000, 33.3]]);
  assert.ok(!r.spreads.some(s => s.stockId === "U"));
});

test("a vehicle listed below recorded cost is a risk with the numbers that prove it", () => {
  const r = capitalInsights([car("b", 480000)], [cost("b", "2026-10-10")], [], asOf);
  const i = r.insights[0];
  assert.equal(i.id, "below-cost"); assert.equal(i.tone, "risk");
  assert.match(i.title, /1 vehicle is listed below recorded cost/);
  assert.match(i.body, /lose ₹45,000/);
  assert.deepEqual(i.evidence, ["B 2022 Maruti b: asking ₹4,80,000 vs cost ₹5,25,000 (−₹45,000)"]);
  assert.equal(i.href, "/inventory#vehicle-b");
});

test("holding cost that already exceeds the margin is flagged, using only the operator's own assumption", () => {
  const a = car("a", 530000);
  const withAssumption = capitalInsights([a], [cost("a", "2026-09-19", { dailyHoldingCost: 500 })], [], asOf); // 30 days x 500 = 15,000 vs margin 5,000
  assert.deepEqual(ids(withAssumption), ["holding-erosion"]);
  assert.equal(withAssumption.holding!.accrued, 15000);
  assert.match(withAssumption.insights[0].evidence[0], /margin ₹5,000 vs holding so far ₹15,000/);
  const without = capitalInsights([a], [cost("a", "2026-09-19", { dailyHoldingCost: null })], [], asOf);
  assert.ok(!ids(without).includes("holding-erosion"), "no assumption recorded, no claim made");
  assert.equal(without.holding, null);
});

test("aged capital is reported as a share and escalates from info to watch to risk", () => {
  const fleet = [car("old", 700000), car("new", 700000)];
  const tone = (oldCost: number, newCost: number) => capitalInsights(fleet, [cost("old", "2026-06-01", { purchasePrice: oldCost }), cost("new", "2026-10-10", { purchasePrice: newCost })], [], asOf).insights.find(i => i.id === "aged-capital")!;
  assert.equal(tone(100000, 900000).tone, "info");
  assert.equal(tone(300000, 700000).tone, "watch");
  const risk = tone(900000, 100000);
  assert.equal(risk.tone, "risk");
  assert.match(risk.title, /₹9,25,000 \(88\.1%\) of recorded capital is in vehicles held 90\+ days/);
  assert.match(risk.evidence[0], /^OLD 2022 Maruti old: 140 days, ₹9,25,000$/);
  assert.equal(capitalPolicy.agedShareRisk, 0.5);
});

test("sales below cost are listed with their loss; profitable sales raise nothing", () => {
  const r = capitalInsights([car("w", 1, { availabilityStatus: "sold" }), car("l", 1, { availabilityStatus: "sold" })], [cost("w", "2026-08-01"), cost("l", "2026-08-01")], [sale("w", 600000), sale("l", 500000)], asOf);
  assert.deepEqual(r.sales.map(s => [s.stockId, s.contribution, s.marginPercent]), [["L", -25000, -5], ["W", 75000, 12.5]]);
  const loss = r.insights.find(i => i.id === "loss-sales")!;
  assert.equal(loss.tone, "risk"); assert.match(loss.body, /lost ₹25,000/); assert.match(loss.evidence[0], /sold ₹5,00,000 vs cost ₹5,25,000 \(−₹25,000\)/);
});

test("missing cost records are a coverage insight that says capital is understated, never zero", () => {
  const r = capitalInsights([car("a", 600000), car("b", 600000), car("c", 600000)], [cost("a", "2026-10-10")], [], asOf);
  const i = r.insights.find(x => x.id === "coverage")!;
  assert.equal(i.tone, "watch"); assert.match(i.title, /2 of 3 unsold vehicles have no cost record/);
  assert.equal(r.report.recordedCapital, 525000, "only the costed vehicle contributes");
});

test("insights are ordered by tone, and a clean, fully costed fleet says so instead of staying silent", () => {
  const mixed = capitalInsights([car("b", 480000), car("u", 600000)], [cost("b", "2026-10-10")], [], asOf);
  assert.deepEqual(mixed.insights.map(i => i.tone), ["risk", "watch"]);
  const clean = capitalInsights([car("a", 640000)], [cost("a", "2026-10-10")], [], asOf);
  assert.deepEqual(ids(clean), ["all-clear"]); assert.equal(clean.insights[0].tone, "good");
  assert.deepEqual(ids(capitalInsights([], [], [], asOf)), ["no-stock"]);
});

test("at most three vehicles are cited as evidence and the engine never mutates its inputs", () => {
  const fleet = ["a", "b", "c", "d", "e"].map(id => car(id, 400000)), costs = fleet.map(v => cost(v.id, "2026-10-10"));
  const frozen = structuredClone({ fleet, costs });
  const r = capitalInsights(fleet, costs, [], asOf);
  assert.equal(r.insights.find(i => i.id === "below-cost")!.evidence.length, 3);
  assert.deepEqual({ fleet, costs }, frozen);
});
