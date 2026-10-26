import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCockpit, cockpitPolicy, planMeters, type CockpitSnapshot } from "../../packages/data/src/cockpit";
import { vehicles, leads as demoLeads } from "../../packages/demo-data/src/index";
import type { Appointment, DealerSubscription, Lead, Sale, StockCost, Task, Vehicle } from "../../packages/contracts/src/index";

const now = new Date("2026-10-19T06:00:00Z"), base = vehicles[0], tenantId = base.tenantId;
const car = (id: string, createdAt: string, extra: Partial<Vehicle> = {}): Vehicle => ({ ...base, id, stockId: id.toUpperCase(), createdAt, availabilityStatus: "available", publishStatus: "published", ...extra });
const lead = (id: string, createdAt: string, extra: Partial<Lead> = {}): Lead => ({ ...demoLeads[0], id, tenantId, name: `Buyer ${id}`, stage: "new", createdAt, updatedAt: createdAt, vehicleId: undefined, vehicleIds: [], assignedTo: undefined, ...extra });
const task = (id: string, dueAt: string, extra: Partial<Task> = {}): Task => ({ id, tenantId, leadId: "l1", title: `Task ${id}`, owner: "Maya", dueAt, completed: false, priority: "normal", version: 3, ...extra });
const cost = (vehicleId: string, acquiredOn: string, purchasePrice = 500000): StockCost => ({ tenantId, vehicleId, version: 1, currency: "INR", acquiredOn, purchasePrice, reconditioningCost: 20000, transferCost: 0, otherCost: 0, dailyHoldingCost: 100, reference: "INV", recordedBy: "o", recordedAt: "2026-10-01T00:00:00Z" });
const sale = (vehicleId: string, amount: number): Sale => ({ id: `s-${vehicleId}`, tenantId, leadId: "l1", vehicleId, amount, currency: "INR", soldAt: "2026-10-10T00:00:00Z", confirmedBy: "o", confirmedAt: "2026-10-10T00:00:00Z" });
const snap = (over: Partial<CockpitSnapshot> = {}): CockpitSnapshot => ({ leads: [], tasks: [], appointments: [], vehicles: [], events: [], costs: [], sales: [], inventoryHistory: [], ...over });
const full = { capital: true, leads: true };
const ids = (c: ReturnType<typeof buildCockpit>) => c.actions.map(a => a.id);

test("inventory and pipeline KPIs are counts of recorded data only", () => {
  const c = buildCockpit(snap({
    vehicles: [car("a", "2026-10-10T00:00:00Z"), car("b", "2026-10-10T00:00:00Z", { availabilityStatus: "reserved" }), car("c", "2026-10-10T00:00:00Z", { availabilityStatus: "sold" }), car("d", "2026-10-10T00:00:00Z", { publishStatus: "draft" as Vehicle["publishStatus"] })],
    leads: [lead("n", "2026-10-19T05:00:00Z"), lead("q", "2026-10-18T00:00:00Z", { stage: "qualified", vehicleId: "a" }), lead("w", "2026-10-01T00:00:00Z", { stage: "won" }), lead("x", "2026-10-01T00:00:00Z", { stage: "lost" }), lead("y", "2026-10-01T00:00:00Z", { stage: "lost" })],
  }), full, now);
  assert.deepEqual([c.inventory.active, c.inventory.available, c.inventory.reserved, c.inventory.sold, c.inventory.unpublished], [3, 2, 1, 1, 1]);
  assert.equal(c.pipeline!.open, 2); assert.equal(c.pipeline!.uncontacted, 1);
  assert.equal(c.pipeline!.winRatePercent, 33.3, "won / (won + lost)");
  assert.equal(c.pipeline!.askingValue, base.price, "only open enquiries on stocked vehicles");
  assert.equal(c.pipeline!.stages.find(s => s.stage === "qualified")!.count, 1);
  assert.equal(buildCockpit(snap(), full, now).pipeline!.winRatePercent, null, "no closed leads means no rate, not 0%");
});

test("capital and contribution are unavailable (null) without capital access and never treat missing costs as zero", () => {
  const fleet = [car("a", "2026-06-01T00:00:00Z"), car("b", "2026-10-10T00:00:00Z"), car("s", "2026-08-01T00:00:00Z", { availabilityStatus: "sold" })];
  const withCosts = snap({ vehicles: fleet, costs: [cost("a", "2026-06-01"), cost("s", "2026-08-01", 400000)], sales: [sale("s", 500000)] });
  const c = buildCockpit(withCosts, full, now);
  assert.equal(c.capital!.recorded, 520000); assert.equal(c.capital!.aged90, 520000);
  assert.deepEqual([c.capital!.covered, c.capital!.active, c.capital!.uncovered], [1, 2, 1]);
  assert.equal(c.profit!.realizedContribution, 80000); assert.equal(c.profit!.marginPercent, 16);
  const denied = buildCockpit({ ...withCosts, costs: undefined }, { capital: false, leads: true }, now);
  assert.equal(denied.capital, null); assert.equal(denied.profit, null);
  assert.ok(!ids(denied).includes("costs:coverage"), "no cost-gap action without capital access");
  assert.ok(denied.inventory.aging.every(b => b.recordedCapital === null), "withheld capital is null, not 0");
});

test("pipeline is withheld without lead access, and so are lead-derived actions", () => {
  const c = buildCockpit(snap({ leads: [lead("n", "2026-10-10T00:00:00Z")], tasks: [task("t", "2026-10-01T00:00:00Z")] }), { capital: false, leads: false }, now);
  assert.equal(c.pipeline, null);
  assert.ok(!c.actions.some(a => ["follow_up", "task", "appointment"].includes(a.category)));
});

test("first-response SLA: under 4 hours is quiet, 4+ is high, 24+ is critical; only new leads count", () => {
  const c = buildCockpit(snap({ leads: [lead("fresh", "2026-10-19T03:00:00Z"), lead("late", "2026-10-19T01:00:00Z"), lead("old", "2026-10-17T06:00:00Z"), lead("done", "2026-10-01T00:00:00Z", { stage: "contacted" })] }), full, now);
  assert.deepEqual(ids(c), ["lead:old:first-response", "lead:late:first-response"]);
  const [old, late] = c.actions;
  assert.equal(old.severity, "critical"); assert.equal(late.severity, "high");
  assert.deepEqual(late.waiting, { value: 5, unit: "hours" });
  assert.match(old.evidence[0], /2 days ago/); assert.equal(old.href, "/leads/old");
  assert.equal(cockpitPolicy.firstResponseHours, 4);
});

test("overdue tasks carry an in-place resolution with the record version; completed and future tasks do not appear", () => {
  const c = buildCockpit(snap({ tasks: [task("over", "2026-10-19T00:00:00Z"), task("very", "2026-10-17T00:00:00Z", { priority: "high" }), task("future", "2026-10-20T00:00:00Z"), task("done", "2026-10-01T00:00:00Z", { completed: true })] }), full, now);
  assert.deepEqual(ids(c), ["task:very", "task:over"]);
  assert.deepEqual(c.actions[0].resolve, { kind: "complete_task", taskId: "very", version: 3 });
  assert.equal(c.actions[0].severity, "critical"); assert.equal(c.actions[1].severity, "high");
  assert.match(c.actions[0].detail, /high priority/);
});

test("scheduled visits whose start time has passed ask for an outcome; cancelled or recent ones do not", () => {
  const appt = (id: string, scheduledAt: string, status: Appointment["status"] = "scheduled"): Appointment => ({ id, leadId: "l1", type: "test_drive", scheduledAt, locationId: base.locationId, status });
  const c = buildCockpit(snap({ leads: [lead("l1", "2026-10-10T00:00:00Z", { stage: "appointment" })], appointments: [appt("past", "2026-10-19T00:00:00Z"), appt("recent", "2026-10-19T05:00:00Z"), appt("cancelled", "2026-10-18T00:00:00Z", "cancelled"), appt("later", "2026-10-19T10:00:00Z")] }), full, now);
  assert.deepEqual(ids(c), ["appointment:past"]);
  assert.match(c.actions[0].title, /test drive with Buyer l1/);
  assert.equal(c.pipeline!.appointmentsToday, 3, "three scheduled visits fall on today's India calendar day; the cancelled one does not count");
});

test("aged stock becomes one prioritised action per vehicle with the evidence that triggered it", () => {
  const stale = car("stale", "2026-06-01T00:00:00Z", { publishStatus: "draft" as Vehicle["publishStatus"] }), mid = car("mid", "2026-08-10T00:00:00Z", { publishStatus: "draft" as Vehicle["publishStatus"] }), fresh = car("fresh", "2026-10-15T00:00:00Z");
  const c = buildCockpit(snap({ vehicles: [stale, mid, fresh], costs: [cost("stale", "2026-06-01")] }), full, now);
  const stock = c.actions.filter(a => a.category === "stock");
  assert.deepEqual(stock.map(a => a.id), ["stock:stale", "stock:mid"]);
  assert.equal(stock[0].severity, "high"); assert.equal(stock[1].severity, "medium");
  assert.match(stock[0].title, /^Publish this aged vehicle/);
  assert.ok(stock[0].evidence.some(e => /days in stock/.test(e)));
  assert.match(stock[0].detail, /₹5,20,000 recorded capital/, "Indian digit grouping, like the rest of the app");
  assert.equal(stock[0].href, "/inventory#vehicle-stale");
});

test("a single aggregated action reports missing cost records", () => {
  const c = buildCockpit(snap({ vehicles: [car("a", "2026-10-15T00:00:00Z"), car("b", "2026-10-15T00:00:00Z"), car("c", "2026-10-15T00:00:00Z")], costs: [cost("a", "2026-10-15")] }), full, now);
  const gap = c.actions.find(a => a.id === "costs:coverage")!;
  assert.match(gap.title, /Record costs for 2 unsold vehicles/); assert.equal(gap.severity, "medium"); assert.equal(gap.href, "/capital");
});

test("plan usage raises capacity alerts that match the server-enforced limits", () => {
  const sub: DealerSubscription = { plan: "starter", status: "active", expiresAt: "2027-01-01T00:00:00Z", reference: "C", updatedAt: now.toISOString() };
  const near = planMeters(sub, { "ai:2026-10": 46, "month:2026-10": 100 }, 45, now);
  assert.deepEqual(near.meters.map(m => [m.key, m.used, m.limit]), [["inventory", 45, 50], ["ai", 46, 50], ["api", 100, 100]]);
  const c = buildCockpit(snap(), full, now, near);
  assert.deepEqual(ids(c), ["plan:api", "plan:ai", "plan:inventory"]);
  assert.equal(c.actions.find(a => a.id === "plan:api")!.severity, "high", "at the limit");
  assert.equal(c.actions.find(a => a.id === "plan:ai")!.severity, "info", "close to the limit");
  const lapsed = buildCockpit(snap(), full, now, planMeters({ ...sub, status: "suspended" }, {}, 0, now));
  assert.equal(lapsed.actions[0].id, "plan:inactive");
});

test("actions are ordered critical first, then by how long they have waited", () => {
  const c = buildCockpit(snap({ leads: [lead("a", "2026-10-19T00:00:00Z"), lead("b", "2026-10-18T00:00:00Z")], tasks: [task("t", "2026-10-10T00:00:00Z")], vehicles: [car("v", "2026-06-01T00:00:00Z", { publishStatus: "draft" as Vehicle["publishStatus"] })], costs: [cost("v", "2026-06-01")] }), full, now);
  assert.deepEqual(c.actions.map(a => a.severity), ["critical", "critical", "high", "high"]);
  assert.deepEqual(ids(c).slice(0, 2), ["task:t", "lead:b:first-response"], "longest-waiting critical item first");
  assert.deepEqual(c.counts, { critical: 2, high: 2, total: 4 });
});

test("the cockpit is deterministic and does not mutate its input", () => {
  const input = snap({ vehicles: [car("a", "2026-06-01T00:00:00Z")], leads: [lead("n", "2026-10-10T00:00:00Z")], tasks: [task("t", "2026-10-10T00:00:00Z")] });
  const frozen = structuredClone(input);
  assert.deepEqual(buildCockpit(input, full, now), buildCockpit(input, full, now));
  assert.deepEqual(input, frozen);
});

test("a lead's overdue 'First response' task is not listed twice, while other overdue tasks on that lead still are", () => {
  const l = lead("l1", "2026-10-17T00:00:00Z");
  const c = buildCockpit(snap({ leads: [l], tasks: [task("fr", "2026-10-17T02:00:00Z", { title: "First response" }), task("fin", "2026-10-17T02:00:00Z", { title: "Share finance options" })] }), full, now);
  assert.deepEqual(ids(c).sort(), ["lead:l1:first-response", "task:fin"]);
});

test("timestamps in action text are human-readable India time, never raw ISO strings", () => {
  const appt: Appointment = { id: "a", leadId: "l1", type: "appointment", scheduledAt: "2026-10-19T00:00:00Z", locationId: base.locationId, status: "scheduled" };
  const c = buildCockpit(snap({ leads: [lead("l1", "2026-10-10T00:00:00Z", { stage: "contacted" })], tasks: [task("t", "2026-10-18T00:00:00Z")], appointments: [appt] }), full, now);
  const text = c.actions.flatMap(a => [a.detail, ...a.evidence]).join(" | ");
  assert.doesNotMatch(text, /\d{4}-\d{2}-\d{2}T/);
  assert.match(text, /Due 18 Oct, 5:30 am IST/i);
  assert.match(text, /scheduled 19 Oct, 5:30 am IST/i);
});
