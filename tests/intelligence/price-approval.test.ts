import { test } from "node:test";
import assert from "node:assert/strict";
import { costBasis, decisionInput, priceApprovalPolicy, priceChangeReasons, priceRequestInput, redactPriceRequest } from "../../packages/data/src/price-approval";
import type { PriceChangeRequest, StockCost } from "../../packages/contracts/src/index";

const cost = (purchase: number, extra: Partial<StockCost> = {}) => ({ tenantId: "t", vehicleId: "v", version: 1, currency: "INR", acquiredOn: "2026-09-01", purchasePrice: purchase, reconditioningCost: 20000, transferCost: 5000, otherCost: 0, dailyHoldingCost: null, reference: "r", recordedBy: "o", recordedAt: "2026-09-01T00:00:00Z", ...extra }) as StockCost;

test("increases and unchanged prices never need approval", () => {
  assert.deepEqual(priceChangeReasons(500000, 520000, cost(900000)), []);
  assert.deepEqual(priceChangeReasons(500000, 500000, cost(900000)), []);
});
test("a reduction below recorded cost basis needs approval and says why, using all cost components", () => {
  assert.equal(costBasis(cost(500000)), 525000);
  assert.deepEqual(priceChangeReasons(540000, 520000, cost(500000)), ["below_cost"]);
  assert.deepEqual(priceChangeReasons(540000, 525000, cost(500000)), [], "equal to cost is not below cost, and a 2.8% drop is small");
});
test("a drop larger than the policy share needs approval even without a cost record, and exactly the limit does not", () => {
  assert.equal(priceApprovalPolicy.maxUnapprovedDropPercent, 10);
  assert.deepEqual(priceChangeReasons(1000000, 899000), ["large_drop"]);
  assert.deepEqual(priceChangeReasons(1000000, 900000), [], "exactly 10% is within policy");
  assert.deepEqual(priceChangeReasons(1000000, 850000, cost(900000)), ["below_cost", "large_drop"]);
});
test("missing costs are never guessed: no below-cost claim without a cost record", () => {
  assert.ok(!priceChangeReasons(500000, 470000).includes("below_cost"));
});
test("request and decision input validation is strict", () => {
  assert.deepEqual(priceRequestInput({ proposedPrice: 450000.456, note: " Slow mover " }), { proposedPrice: 450000.46, note: "Slow mover" });
  for (const bad of [{}, { proposedPrice: -1, note: "x" }, { proposedPrice: "5", note: "x" }, { proposedPrice: 5, note: "" }, { proposedPrice: 5, note: "x".repeat(501) }, { proposedPrice: Infinity, note: "x" }]) assert.throws(() => priceRequestInput(bad), /Enter a valid|Explain/);
  assert.deepEqual(decisionInput({ decision: "approved" }), { decision: "approved", note: "" });
  assert.throws(() => decisionInput({ decision: "rejected" }), /Say why/);
  assert.throws(() => decisionInput({ decision: "maybe" }), /approve or reject/);
});
test("roles without capital access never learn that a price is below cost", () => {
  const request = { id: "r", tenantId: "t", vehicleId: "v", version: 1, currentPrice: 1, proposedPrice: 1, vehicleVersion: 0, reasons: ["below_cost", "large_drop"], note: "", status: "pending", requestedBy: "u", requestedAt: "x" } as PriceChangeRequest;
  assert.deepEqual(redactPriceRequest(request, true).reasons, ["below_cost", "large_drop"]);
  assert.deepEqual(redactPriceRequest(request, false).reasons, ["large_drop"]);
  assert.deepEqual(redactPriceRequest({ ...request, reasons: ["below_cost"] }, false).reasons, []);
});
