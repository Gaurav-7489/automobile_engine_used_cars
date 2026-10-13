import { test } from "node:test";
import assert from "node:assert/strict";
import { acquisitionOptions, demoOpportunities } from "../../apps/command-center/lib/acquisition";
const input = { budget: 1000000, reserve: 50000, city: "Kochi", plan: "growth" as const, count: 2 as const, goal: "margin" as const };
test("dealer portfolios count all costs and reserve and never repeat a car", () => {
  const options = acquisitionOptions(input, demoOpportunities);
  assert.ok(options.length > 0);
  for (const o of options) {
    assert.equal(o.cars.length, 2);
    assert.notEqual(o.cars[0].id, o.cars[1].id);
    assert.ok(o.landedCost + input.reserve <= input.budget);
    assert.equal(o.unallocated, input.budget - input.reserve - o.landedCost);
    assert.equal(o.margin, o.cars.reduce((n, c) => n + c.resale, 0) - o.landedCost);
  }
  assert.deepEqual(options.map(o => o.margin), options.map(o => o.margin).sort((a, b) => b - a));
});
test("Starter limits preview to local single cars", () => {
  assert.deepEqual(acquisitionOptions({ ...input, plan: "starter" }, demoOpportunities), []);
  const options = acquisitionOptions({ ...input, plan: "starter", count: 1 }, demoOpportunities);
  assert.ok(options.length > 0);
  assert.ok(options.every(o => o.cars[0].city === "Kochi"));
});
test("invalid inputs fail and insufficient capital returns no results", () => {
  for (const budget of [NaN, Infinity, -1, 0, 1.5]) assert.throws(() => acquisitionOptions({ ...input, budget }, demoOpportunities));
  assert.throws(() => acquisitionOptions({ ...input, reserve: 1000001 }, demoOpportunities));
  assert.deepEqual(acquisitionOptions({ ...input, budget: 50000 }, demoOpportunities), []);
  assert.deepEqual(acquisitionOptions(input, demoOpportunities.map(o => ({ ...o, preparation: NaN }))), []);
});
test("demand ranking and duplicate sourcing IDs are handled", () => {
  const options = acquisitionOptions({ ...input, goal: "demand" }, [...demoOpportunities, demoOpportunities[0]]);
  assert.deepEqual(options.map(o => o.demand), options.map(o => o.demand).sort((a, b) => b - a));
  const ids = options.map(o => o.cars.map(c => c.id).join("+"));
  assert.equal(ids.length, new Set(ids).size);
});
