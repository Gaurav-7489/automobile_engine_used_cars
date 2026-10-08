import type { StockCost, Vehicle, Sale } from "@vandlabs/contracts";
import { InputError } from "./errors";
export type StockCostInput=Pick<StockCost,"acquiredOn"|"purchasePrice"|"reconditioningCost"|"transferCost"|"otherCost"|"dailyHoldingCost"|"reference">;
function businessDate(date:Date) {
  const parts=new Intl.DateTimeFormat("en",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const value=(type:string)=>parts.find(p=>p.type===type)!.value;return `${value("year")}-${value("month")}-${value("day")}`;
}
function money(value:unknown,positive=false):number {
  if(typeof value!=="number"||!Number.isFinite(value)||value<(positive?0.01:0)||value>999999999999||Math.abs(value*100-Math.round(value*100))>0.001)throw new InputError("Enter valid INR amounts with at most two decimal places.");
  return value;
}
export function costInput(value:unknown):StockCostInput {
  if(!value||typeof value!=="object"||Array.isArray(value))throw new InputError();
  const v=value as Record<string,unknown>;
  const fields=["acquiredOn","purchasePrice","reconditioningCost","transferCost","otherCost","dailyHoldingCost","reference"];
  if(Object.keys(v).some(k=>!fields.includes(k)))throw new InputError("Protected cost field.");
  if(typeof v.acquiredOn!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v.acquiredOn))throw new InputError("Enter an acquisition date.");
  const date=new Date(v.acquiredOn+"T00:00:00Z");
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==v.acquiredOn||v.acquiredOn>businessDate(new Date())||date.getUTCFullYear()<1900)throw new InputError("Acquisition date must be valid and not in the future.");
  if(typeof v.reference!=="string"||!v.reference.trim()||v.reference.length>120)throw new InputError("Enter a supporting invoice or internal reference.");
  return {acquiredOn:v.acquiredOn,purchasePrice:money(v.purchasePrice,true),reconditioningCost:money(v.reconditioningCost),transferCost:money(v.transferCost),otherCost:money(v.otherCost),dailyHoldingCost:v.dailyHoldingCost===null?null:money(v.dailyHoldingCost),reference:v.reference.trim()};
}
export function validateCostVersion(version:unknown):asserts version is number {
  if(typeof version!=="number"||!Number.isSafeInteger(version)||version<0)throw new InputError("Expected cost record version is required.");
}
export function validateAcquisitionSale(input:StockCostInput,sale?:Pick<Sale,"soldAt">) {
  if(sale&&input.acquiredOn>businessDate(new Date(sale.soldAt)))throw new InputError("Acquisition cannot follow the recorded sale.");
}
export function capitalReport(vehicles:Vehicle[],costs:StockCost[],sales:Sale[],asOf=new Date()) {
  if(!Number.isFinite(asOf.getTime()))throw new InputError();
  const rows=vehicles.map(vehicle=> {
    const cost=costs.find(c=>c.vehicleId===vehicle.id),sale=sales.find(s=>s.vehicleId===vehicle.id);
    const active=vehicle.availabilityStatus!=="sold";
    if(!cost)return {vehicleId:vehicle.id,active,coverage:"missing" as const,ageDays:null,costBasis:null,holdingEstimate:null,askingSpread:null,recordedContribution:null,priority:"unknown" as const};
    const end=sale?Math.min(Date.parse(sale.soldAt),asOf.getTime()):asOf.getTime();
    const endDay=Date.parse(businessDate(new Date(end))+"T00:00:00Z"),acquired=Date.parse(cost.acquiredOn+"T00:00:00Z");
    const ageDays=endDay<acquired?null:Math.floor((endDay-acquired)/86400000);
    const costBasis=Math.round((cost.purchasePrice+cost.reconditioningCost+cost.transferCost+cost.otherCost)*100)/100;
    const holdingCents=cost.dailyHoldingCost===null||ageDays===null?null:Math.round(cost.dailyHoldingCost*100)*ageDays;
    const holdingEstimate=holdingCents===null||!Number.isSafeInteger(holdingCents)?null:holdingCents/100;
    const priority=!active?"closed":ageDays===null?"unknown":ageDays>=90?"priority":ageDays>=60?"review":ageDays>=30?"watch":"current";
    return {vehicleId:vehicle.id,active,coverage:"recorded" as const,ageDays,costBasis,holdingEstimate,askingSpread:Math.round((vehicle.price-costBasis)*100)/100,recordedContribution:sale?Math.round((sale.amount-costBasis)*100)/100:null,priority};
  });
  const active=rows.filter(r=>r.active),covered=active.filter(r=>r.costBasis!==null);
  const total=(values:number[])=>{const cents=values.reduce((n,v)=>n+Math.round(v*100),0);if(!Number.isSafeInteger(cents))throw new InputError("Report amounts exceed safe precision.");return cents/100;};
  return {asOf:asOf.toISOString(),version:"capital-rules-v1",rows,
    activeVehicles:active.length,coveredVehicles:covered.length,uncoveredVehicles:active.length-covered.length,
    recordedCapital:total(covered.map(r=>r.costBasis!)),
    agedCapital:total(covered.filter(r=>r.ageDays!==null&&r.ageDays>=90).map(r=>r.costBasis!)),
    realizedContribution:total(rows.map(r=>r.recordedContribution??0)),
    saleCostCoverage:rows.filter(r=>r.recordedContribution!==null).length,
    assumptions:["Age bands: watch 30, review 60, priority 90 days in the Asia/Kolkata business calendar; operational defaults, not market predictions.","Capital is recorded purchase plus reconditioning, transfer and other costs for unsold stock; missing records are excluded, not zero.","Asking spread and recorded contribution exclude unrecorded taxes, financing, overhead and sale expenses. They are not net profit.","Holding estimates use the operator-entered daily assumption and stop at sale. Unknown daily costs remain unknown."],
  };
}
