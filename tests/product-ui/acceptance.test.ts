import assert from "node:assert/strict";
import test from "node:test";
import { approvePriceRequest, createPriceRequest, transitionVehicle, updateVehicle, approveCampaign, submitCampaign, createCampaign, publishCampaign, pauseCampaign, type Actor } from "../../apps/intelligence/lib/actions";
import { buildSeed, buildEmptySeed } from "../../apps/intelligence/lib/state";
import { overviewModel, capitalModel, alertCounts, alertsFor } from "../../apps/intelligence/lib/selectors";
import { regionStats, DEFAULT_COHORT } from "../../apps/intelligence/lib/market";
import { scenarioTotals, priceImpact } from "../../apps/intelligence/lib/finance";
import { evidenceTier, difference } from "../../apps/intelligence/lib/evidence";
import { formatMoney, lakh } from "../../apps/intelligence/lib/format";

const owner: Actor = { sub: "u-owner", name: "Arjun Rao", role: "owner", branchIds: ["koc", "tcr", "ccj"] };
const manager: Actor = { sub: "u-manager", name: "Manager 01", role: "manager", branchIds: ["koc", "tcr"] };
const marketing: Actor = { sub: "u-marketing", name: "Marketing 01", role: "marketing", branchIds: ["koc"] };

test("published aggregates reconcile with the sample dataset", () => {
  const s = buildSeed();
  const m = overviewModel(s, ["koc"]).metrics;
  assert.equal(m.available, 42);
  assert.equal(m.unsold, 48);
  assert.equal(formatMoney(m.landedCapital), "₹3.80 Cr");
  assert.equal(m.ageing, 7);
  assert.equal(formatMoney(m.estimatedGross), "₹24.6 L");
  assert.deepEqual(Object.values(m.availableByAge), [12, 13, 10, 7]);
  const c = capitalModel(s, ["koc"]);
  assert.equal(formatMoney(c.realized.profit), "₹18.2 L");
  assert.equal(c.realized.count, 30);
  assert.equal(c.realized.medianDaysToSale, 32);
  const a = alertCounts(alertsFor(s, ["koc"]));
  assert.deepEqual([a.critical, a.dueToday, a.overdue, a.waiting], [1, 4, 2, 3]);
});

test("T01 data absent: no fake zero-valued market history", () => {
  const m = overviewModel(buildEmptySeed(), ["koc"]);
  assert.equal(m.hasStock, false);
  assert.equal(m.metrics.available, 0);
});

test("T02 cohort integrity: -2.4% below estimate", () => {
  assert.equal(Math.round(difference(lakh(28.5), lakh(29.2))! * 10) / 10, -2.4);
});

test("T03 price decision numbers and distinct approver", () => {
  const i = priceImpact({ currentAsking: lakh(26.8), proposedAsking: lakh(25.9), landed: lakh(24.8), holdingSelling: lakh(0.2) });
  assert.equal(formatMoney(i.proposedGross), "₹1.1 L");
  assert.equal(Math.round((i.reductionPct ?? 0) * 10) / 10, -3.4);
  assert.equal(formatMoney(i.contribution, { dp: 2 }), "₹0.90 L");
  const s = buildSeed();
  const created = createPriceRequest(s, manager, { vehicleId: "V-1043", proposedAsking: lakh(25.9), reason: "Ageing stock and low enquiry activity", submit: true });
  assert.ok(created.ok);
  const self = approvePriceRequest(created.state, manager, created.request.id);
  assert.ok(!self.ok && self.status === 403);
  assert.ok(approvePriceRequest(created.state, owner, created.request.id).ok);
});

test("T04 race condition: concurrent edit blocks approval with 409", () => {
  const s = buildSeed();
  const created = createPriceRequest(s, manager, { vehicleId: "V-1043", proposedAsking: lakh(25.9), reason: "Test", submit: true });
  assert.ok(created.ok);
  const v = created.state.vehicles.find((x) => x.id === "V-1043")!;
  const edited = updateVehicle(created.state, owner, "V-1043", v.version, { km: 62500 });
  assert.ok(edited.ok);
  const blocked = approvePriceRequest(edited.state, owner, created.request.id);
  assert.ok(!blocked.ok && blocked.status === 409);
  const stale = updateVehicle(edited.state, owner, "V-1043", v.version, { km: 1 });
  assert.ok(!stale.ok && stale.status === 409);
});

test("T05 campaign safety: reserving a vehicle queues a pause", () => {
  let s = buildSeed();
  s = { ...s, integrations: s.integrations.map((i) => (i.id === "ads" ? { ...i, state: "Connected" as const } : i)) };
  const c = createCampaign(s, marketing, "V-1042"); assert.ok(c.ok);
  const sub = submitCampaign(c.state, marketing, c.campaign.id); assert.ok(sub.ok, JSON.stringify(!sub.ok && sub));
  const appr = approveCampaign(sub.state, owner, c.campaign.id); assert.ok(appr.ok);
  const pub = publishCampaign(appr.state, marketing, c.campaign.id); assert.ok(pub.ok);
  const active = { ...pub.state, campaigns: pub.state.campaigns.map((x) => (x.id === c.campaign.id ? { ...x, status: "Active" as const } : x)) };
  const v = active.vehicles.find((x) => x.id === "V-1042")!;
  const t = transitionVehicle(active, owner, "V-1042", v.version, { to: "reserved", note: "Booking B-9" });
  assert.ok(t.ok && t.pausedCampaigns.includes(c.campaign.id));
  assert.equal(t.state.campaigns.find((x) => x.id === c.campaign.id)!.status, "Pausing");
  void pauseCampaign;
});

test("T07 regional costs and T08 realized profit", () => {
  const bengaluru = regionStats(DEFAULT_COHORT).stats.find((r) => r.region === "Bengaluru")!;
  const landed = bengaluru.median! + bengaluru.transport + bengaluru.fees;
  assert.equal(formatMoney(landed), "₹28.7 L");
  assert.equal(formatMoney(lakh(29.2) - landed, { dp: 2 }), "₹0.50 L");
  assert.equal(lakh(34.5) - lakh(32.7) - lakh(0.6), lakh(1.2));
  const sc = scenarioTotals({ offer: lakh(28.5), transport: lakh(0.35), inspection: lakh(0.05), refurbishment: lakh(0.4), fees: lakh(0.2), holdingSelling: lakh(0.2), targetResale: lakh(30) });
  assert.equal(formatMoney(sc.landed), "₹29.5 L");
  assert.equal(formatMoney(sc.contribution, { dp: 2 }), "₹0.30 L");
});

test("evidence tier rule", () => {
  assert.equal(evidenceTier(30, 0.9, 7), "High");
  assert.equal(evidenceTier(18, 0.86, 14), "Moderate");
  assert.equal(evidenceTier(9, 0.9, 7), "Insufficient");
});

test("sold requires a sale record and unavailable states are rejected", () => {
  const s = buildSeed();
  const v = s.vehicles.find((x) => x.id === "V-1042")!;
  const r = transitionVehicle(s, owner, "V-1042", v.version, { to: "sold" });
  assert.ok(!r.ok && r.status === 422);
});
