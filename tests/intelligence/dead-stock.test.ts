import { test } from "node:test";
import assert from "node:assert/strict";
import { deadStockReport, validateDeadStockPolicy, defaultDeadStockPolicy, bandLabels } from "../../packages/data/src/dead-stock";
import { vehicles, leads } from "../../packages/demo-data/src/index";
import type { JourneyEvent, Lead, StockCost, Sale, Vehicle, InventoryChange } from "../../packages/contracts/src/index";

const asOf = new Date("2026-10-16T06:00:00Z");
const base = vehicles[0];
const car = (id: string, createdAt: string, extra: Partial<Vehicle> = {}): Vehicle => ({ ...base, id, stockId: id, createdAt, availabilityStatus: "available", publishStatus: "published", ...extra });
const views = (vehicleId: string, n: number, at = "2026-10-10T00:00:00Z", tenantId = base.tenantId): JourneyEvent[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${vehicleId}-v${i}`, tenantId, sessionId: `s${i}`, type: "vehicle_view", vehicleId, path: "/", occurredAt: at }));
const empty = { leads: [] as Lead[], events: [] as JourneyEvent[], costs: [] as StockCost[], sales: [] as Sale[], inventoryHistory: [] as InventoryChange[] };

test("vehicles fall into the configured 0–30 / 31–60 / 61–90 / over-90 bands by India calendar day", () => {
  const fleet = [car("a", "2026-09-16T06:00:00Z"), car("b", "2026-09-15T06:00:00Z"), car("c", "2026-08-16T06:00:00Z"), car("d", "2026-07-18T06:00:00Z"), car("e", "2026-07-17T06:00:00Z")];
  const r = deadStockReport({ ...empty, vehicles: fleet }, asOf);
  const band = (id: string) => r.vehicles.find(v => v.vehicleId === id)!.band;
  assert.equal(band("a"), "0–30 days"); assert.equal(band("b"), "31–60 days"); assert.equal(band("c"), "61–90 days");
  assert.equal(band("d"), "61–90 days"); assert.equal(band("e"), "Over 90 days");
  assert.deepEqual(r.bands.map(b => b.vehicles), [1, 1, 2, 1]);
  assert.ok(r.vehicles.every(v => v.ageBasis === "listing" && v.reviewRequired));
  assert.equal(r.vehicles[0].vehicleId, "e", "oldest first");
});

test("acquisition date overrides listing date and recorded capital never treats missing cost as zero", () => {
  const v = car("x", "2026-10-15T00:00:00Z"), w = car("y", "2026-10-15T00:00:00Z");
  const cost: StockCost = { vehicleId: "x", tenantId: base.tenantId, acquiredOn: "2026-07-01", purchasePrice: 500000, reconditioningCost: 20000, transferCost: 0, otherCost: 0, dailyHoldingCost: null, reference: "INV-1", version: 1, currency: "INR", recordedBy: "staff", recordedAt: "2026-07-01T00:00:00Z" };
  const r = deadStockReport({ ...empty, vehicles: [v, w], costs: [cost] }, asOf);
  const x = r.vehicles.find(r => r.vehicleId === "x")!;
  assert.equal(x.ageBasis, "acquisition"); assert.equal(x.band, "Over 90 days"); assert.equal(x.capitalLocked, 520000);
  const over = r.bands.find(b => b.label === "Over 90 days")!, fresh = r.bands.find(b => b.label === "0–30 days")!;
  assert.equal(over.recordedCapital, 520000); assert.equal(fresh.recordedCapital, 0); assert.equal(fresh.costCoverage, "0/1");
});

test("sold stock is excluded, reserved stock is not pushed to promote or reprice", () => {
  const sold = car("s", "2026-06-01T00:00:00Z", { availabilityStatus: "sold" }), held = car("h", "2026-06-01T00:00:00Z", { availabilityStatus: "reserved" });
  const r = deadStockReport({ ...empty, vehicles: [sold, held] }, asOf);
  assert.deepEqual(r.vehicles.map(v => v.vehicleId), ["h"]);
  assert.ok(!r.vehicles[0].recommendations.some(x => ["promote", "review_price", "publish"].includes(x.action)));
});

test("recommendations are evidence-triggered: promote, review price, publish, follow up and inspect", () => {
  const quiet = car("quiet", "2026-08-01T00:00:00Z"), browsed = car("browsed", "2026-08-01T00:00:00Z"), hidden = car("hidden", "2026-08-01T00:00:00Z", { publishStatus: "draft" as Vehicle["publishStatus"] });
  const broken = car("broken", "2026-10-10T00:00:00Z", { media: [], price: 0 }), wanted = car("wanted", "2026-08-01T00:00:00Z");
  const lead: Lead = { ...leads[0], tenantId: base.tenantId, vehicleId: "wanted", vehicleIds: ["wanted"], stage: "contacted", createdAt: "2026-10-12T00:00:00Z" };
  const r = deadStockReport({ ...empty, vehicles: [quiet, browsed, hidden, broken, wanted], leads: [lead], events: [...views("quiet", 2), ...views("browsed", 25), ...views("wanted", 25)] }, asOf);
  const actions = (id: string) => r.vehicles.find(v => v.vehicleId === id)!.recommendations.map(x => x.action);
  assert.deepEqual(actions("quiet"), ["promote"]);
  assert.deepEqual(actions("browsed"), ["review_price"]);
  assert.ok(actions("hidden").includes("publish"));
  assert.deepEqual(actions("broken"), ["inspect"], "fresh stock gets data fixes only");
  assert.deepEqual(actions("wanted"), ["follow_up"], "enquiries suppress the price prompt");
  for (const v of r.vehicles) for (const rec of v.recommendations) assert.ok(rec.evidence.length > 0);
});

test("recent price change, out-of-window and other-tenant activity are respected", () => {
  const v = car("p", "2026-08-01T00:00:00Z");
  const change: InventoryChange = { id: "h1", tenantId: base.tenantId, vehicleId: "p", actor: "staff", occurredAt: "2026-10-10T00:00:00Z", before: { price: 900000, availabilityStatus: "available", publishStatus: "published" }, after: { price: 850000, availabilityStatus: "available", publishStatus: "published" } };
  const recent = deadStockReport({ ...empty, vehicles: [v], events: views("p", 25), inventoryHistory: [change] }, asOf);
  assert.ok(!recent.vehicles[0].recommendations.some(x => x.action === "review_price"));
  assert.equal(recent.vehicles[0].lastPriceChange, "2026-10-10T00:00:00Z");
  const stale = deadStockReport({ ...empty, vehicles: [v], events: views("p", 25, "2026-08-20T00:00:00Z") }, asOf);
  assert.equal(stale.vehicles[0].views, 0);
  const foreign = deadStockReport({ ...empty, vehicles: [v], events: views("p", 25, undefined, "other-tenant") }, asOf);
  assert.equal(foreign.vehicles[0].views, 0);
});

test("policy validation rejects malformed bands and windows; labels follow the policy", () => {
  assert.throws(() => validateDeadStockPolicy({ ...defaultDeadStockPolicy, bandLimits: [30, 30, 90] }));
  assert.throws(() => validateDeadStockPolicy({ ...defaultDeadStockPolicy, bandLimits: [30.5, 60, 90] }));
  assert.throws(() => validateDeadStockPolicy({ ...defaultDeadStockPolicy, lookbackDays: 0 }));
  assert.throws(() => deadStockReport({ ...empty, vehicles: [] }, new Date("bad")));
  assert.deepEqual(bandLabels({ ...defaultDeadStockPolicy, bandLimits: [15, 45, 75] }), ["0–15 days", "16–45 days", "46–75 days", "Over 75 days"]);
  const bad = deadStockReport({ ...empty, vehicles: [car("z", "not-a-date")] }, asOf);
  assert.equal(bad.vehicles[0].band, null); assert.equal(bad.unknownAge, 1); assert.deepEqual(bad.vehicles[0].recommendations.map(r => r.action), ["inspect"]);
});
