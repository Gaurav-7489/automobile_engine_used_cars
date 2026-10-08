import { test } from "node:test";
import assert from "node:assert/strict";
import { inventoryInsights, matchInventory } from "../../packages/data/src/intelligence";
import { vehicles, leads, tasks, appointments } from "../../packages/demo-data/src/index";
const snapshot={vehicles,leads,tasks,appointments,activities:[],events:[],rules:[],runs:[]};
test("matching respects every hard preference and suppresses unavailable or unpublished stock",()=> {
  const matches=matchInventory(vehicles,{maxPrice:5500000,fuelType:"diesel",transmission:"automatic",bodyType:"SUV"});
  assert.ok(matches.length>0);
  for(const match of matches){const v=vehicles.find(v=>v.id===match.vehicleId)!;assert.ok(v.price<=5500000);assert.equal(v.fuelType,"diesel");assert.equal(v.bodyType,"SUV");assert.equal(v.availabilityStatus,"available");assert.equal(v.publishStatus,"published");}
  assert.equal(matchInventory(vehicles,{maxPrice:1}).length,0);
  assert.throws(()=>matchInventory(vehicles,{maxPrice:NaN}),/Invalid budget/);
});
test("briefing uses actual evidence and never invents acquisition dates, cost or market values",()=> {
  const asOf=new Date("2026-10-08T12:00:00Z");const report=inventoryInsights(snapshot,asOf);
  assert.equal(report.asOf,asOf.toISOString());assert.equal(report.coverage.vehicleCosts,0);
  assert.ok(report.vehicles.every(v=>v.capitalInvested===null&&v.margin===null&&v.acquisitionAgeDays===null));
  assert.equal(report.vehicles[0].views,0);assert.equal(report.vehicles[0].recordAgeDays,9);
  assert.ok(report.briefing.overdueTasks.length>0);
  assert.ok(report.briefing.rescueCandidates.every(candidate=>leads.some(l=>l.id===candidate.leadId&&l.consent.marketing&&l.consent.whatsapp)&&!candidate.sendAuthorized));
  const invalid=inventoryInsights({...snapshot,vehicles:[{...vehicles[0],createdAt:"bad",price:NaN,media:[]}]},asOf);
  assert.equal(invalid.vehicles[0].recordAgeDays,null);assert.equal(invalid.dataQuality.withIssues,1);
});
