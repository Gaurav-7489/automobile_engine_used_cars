import { test } from "node:test";
import assert from "node:assert/strict";
import { capitalReport, costInput, validateAcquisitionSale } from "../../packages/data/src/capital";
import { vehicles } from "../../packages/demo-data/src/index";
import type { StockCost, Sale } from "../../packages/contracts/src/index";
const input={acquiredOn:"2026-06-01",purchasePrice:1000000,reconditioningCost:25000,transferCost:5000,otherCost:0,dailyHoldingCost:100,reference:"INVOICE-1"};
const cost:StockCost={...input,vehicleId:vehicles[0].id,tenantId:vehicles[0].tenantId,version:1,currency:"INR",recordedBy:"staff",recordedAt:"2026-10-01T00:00:00Z"};
test("capital evidence uses recorded acquisition/costs, excludes missing costs and freezes holding age at sale",()=> {
  const v={...vehicles[0],price:1200000,availabilityStatus:"available" as const};
  const report=capitalReport([v,{...v,id:"missing"}],[cost],[],new Date("2026-10-01T00:00:00Z"));
  assert.equal(report.coveredVehicles,1);assert.equal(report.uncoveredVehicles,1);assert.equal(report.recordedCapital,1030000);assert.equal(report.agedCapital,1030000);
  assert.equal(report.rows[0].ageDays,122);assert.equal(report.rows[0].holdingEstimate,12200);assert.equal(report.rows[0].askingSpread,170000);assert.equal(report.rows[0].priority,"priority");assert.equal(report.rows[1].costBasis,null);
  const sale:Sale={id:"sale",tenantId:v.tenantId,vehicleId:v.id,leadId:"lead",amount:1150000,soldAt:"2026-07-01T00:00:00Z",currency:"INR",confirmedBy:"staff",confirmedAt:"2026-07-01T00:00:00Z"};
  const sold=capitalReport([{...v,availabilityStatus:"sold"}],[cost],[sale],new Date("2026-10-01T00:00:00Z"));assert.equal(sold.recordedCapital,0);assert.equal(sold.rows[0].ageDays,30);assert.equal(sold.rows[0].holdingEstimate,3000);assert.equal(sold.realizedContribution,120000);
  assert.equal(capitalReport([v],[{...cost,dailyHoldingCost:null}],[]).rows[0].holdingEstimate,null);
});
test("cost intake rejects invalid dates, forged fields and invalid amounts rather than coercing",()=> {
  for(const patch of [{acquiredOn:"2026-02-30"},{acquiredOn:"2099-01-01"},{purchasePrice:0},{transferCost:-1},{otherCost:"0"},{dailyHoldingCost:undefined},{otherCost:0.001},{tenantId:"forged"},{version:100},{reference:""}])assert.throws(()=>costInput({...input,...patch}));
  assert.equal(costInput({...input,dailyHoldingCost:null}).dailyHoldingCost,null);
});

test("India acquisition dates match sales across the UTC midnight boundary",()=> {
  assert.doesNotThrow(()=>validateAcquisitionSale({...input,acquiredOn:"2026-07-02"},{soldAt:"2026-07-01T19:00:00Z"}));
  assert.throws(()=>validateAcquisitionSale({...input,acquiredOn:"2026-07-03"},{soldAt:"2026-07-01T19:00:00Z"}));
});
