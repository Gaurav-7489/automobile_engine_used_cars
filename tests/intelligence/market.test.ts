import { test } from "node:test";
import assert from "node:assert/strict";
import type { CommerceState, SourcingVehicle } from "../../packages/contracts/src/index";
import { marketReport } from "../../packages/data/src/market";
import { ingestBatch, vehicleInput } from "../../packages/data/src/commerce-rules";
const now = new Date("2026-10-15T12:00:00Z"), expiry = "2026-11-01T00:00:00Z";
const source = { id: "dealer", name: "Test dealer", kind: "dealer" as const, agreement: "Test agreement", dealerUse: true, redistribute: false, enabled: true, expiresAt: expiry };
const vehicle: SourcingVehicle = { id: "dealer:one", sourceId: "dealer", sourceRecordId: "one", make: "Maruti", model: "Swift", year: 2021, city: "Kochi", state: "Kerala", latitude: 9, longitude: 76, fuel: "petrol", transmission: "manual", odometerKm: 40000, purchasePrice: 300000, preparationCost: 10000, transferFees: 5000, resaleLow: null, resaleHigh: null, demandScore: null, mileageKmpl: null, evidence: "Isolated fixture", observedAt: now.toISOString(), expiresAt: expiry, available: true };
const state = (vehicles: SourcingVehicle[]): CommerceState => ({ subscription: null, sources: [{ ...source }], vehicles, fuel: [], keys: [], usage: {}, audit: [] });
const priced = (amount: number, index: number): SourcingVehicle => ({ ...vehicle, id: `dealer:${index}`, sourceRecordId: String(index), askingPrice: { amount, currency: "INR", observedAt: now.toISOString() } });
test("market prices never fall back to acquisition quotes or resale projections", () => {
  const report = marketReport(state([vehicle]), {}, now);
  assert.equal(report.distribution.median, null); assert.equal(report.coverage.eligible, 1);
  assert.equal(report.coverage.matching, 0); assert.deepEqual(report.items, []);
  assert.ok(report.notices.some(n => n.includes("lack valid asking prices")));
});
test("asking-price quartiles, regional samples and exact cohort filters use permitted records", () => {
  const vehicles = [100000, 200000, 300000, 400000].map(priced);
  vehicles[3].city = "Delhi";
  const report = marketReport(state(vehicles), { make: "maruti", model: "SWIFT", minYear: "2021", maxYear: 2021 }, now);
  assert.deepEqual(report.distribution, { count: 4, min: 100000, q1: 175000, median: 250000, q3: 325000, max: 400000 });
  assert.equal(report.cities.find(c => c.city === "Kochi")?.median, 200000);
  assert.equal(report.coverage.sources, 1); assert.equal(report.demo, false);
  assert.equal(marketReport(state(vehicles), { city: "kochi", minPrice: 200000, maxPrice: 300000 }, now).coverage.matching, 2);
  assert.equal(marketReport(state(vehicles), { transmission: "automatic" }, now).coverage.matching, 0);
});
test("source license, availability, expiry and price-specific freshness exclude evidence", () => {
  const fresh = priced(400000, 0), stale = priced(500000, 1);
  stale.askingPrice!.observedAt = "2026-10-01T00:00:00Z";
  const data = state([fresh, stale, { ...priced(600000, 2), available: false }, { ...priced(700000, 3), expiresAt: "2026-10-14T00:00:00Z" }]);
  assert.equal(marketReport(data, {}, now).coverage.matching, 1);
  assert.equal(marketReport(data, { maxAgeDays: 30 }, now).coverage.matching, 2);
  data.sources[0].dealerUse = false;
  assert.equal(marketReport(data, {}, now).coverage.matching, 0);
  data.sources[0] = { ...source, expiresAt: "2026-10-14T00:00:00Z" };
  assert.equal(marketReport(data, {}, now).coverage.matching, 0);
});
test("asking-price payloads require explicit currency, sane amounts and independent chronology", () => {
  for (const askingPrice of [{ amount: 400000, currency: "USD", observedAt: now.toISOString() }, { amount: -1, currency: "INR", observedAt: now.toISOString() }, { amount: 400000, currency: "INR", observedAt: "2026-10-15T12:00:30Z" }]) {
    assert.throws(() => vehicleInput({ ...vehicle, askingPrice }, source, now));
  }
  const old = priced(400000, 0), data = state([old]);
  const newerVehicle = { ...old, observedAt: "2026-10-15T12:00:30Z", askingPrice: { ...old.askingPrice!, observedAt: "2026-10-14T12:00:00Z" } };
  assert.throws(() => ingestBatch(data, source.id, { vehicles: [newerVehicle] }, now), /older observation/);
  assert.throws(() => ingestBatch(data, source.id, { vehicles: [{ ...old, askingPrice: undefined }] }, now), /removed/);
  assert.equal(data.vehicles[0].askingPrice!.amount, 400000);
});
test("market pagination is stable, bounded and filters reject malformed input", () => {
  const data = state(Array.from({ length: 30 }, (_, i) => priced(100000 + i, i)));
  const first = marketReport(data, {}, now), second = marketReport(data, { page: "2" }, now);
  assert.equal(first.items.length, 25); assert.equal(second.items.length, 5);
  assert.equal(new Set([...first.items, ...second.items].map(v => v.id)).size, 30);
  for (const filters of [{ minPrice: 10, maxPrice: 1 }, { minYear: 2025, maxYear: 2020 }, { maxAgeDays: 0 }, { maxKm: [] }, { page: "NaN" }, { fuel: "unknown" }]) assert.throws(() => marketReport(data, filters, now));
});
