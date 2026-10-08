import type { Vehicle } from "@vandlabs/contracts";
import type { Snapshot } from "./index";
export interface BuyerPreferences {
  maxPrice?: number; fuelType?: Vehicle["fuelType"]; transmission?: Vehicle["transmission"]; bodyType?: string;
}
// Exact filtering, never a model-generated stock record or financial recommendation.
export function matchInventory(vehicles:Vehicle[],preferences:BuyerPreferences) {
  if(preferences.maxPrice!==undefined&&(!Number.isFinite(preferences.maxPrice)||preferences.maxPrice<0))throw new Error("Invalid budget.");
  return vehicles.filter(v=>v.publishStatus==="published"&&v.availabilityStatus==="available"&&
    (preferences.maxPrice===undefined||v.price<=preferences.maxPrice)&&
    (!preferences.fuelType||v.fuelType===preferences.fuelType)&&
    (!preferences.transmission||v.transmission===preferences.transmission)&&
    (!preferences.bodyType||v.bodyType.toLowerCase()===preferences.bodyType.toLowerCase()))
    .sort((a,b)=>a.price-b.price).map(v=>({vehicleId:v.id,price:v.price,reasons:["Published and available",...(preferences.maxPrice!==undefined?["Within confirmed budget"]:[]),...(preferences.fuelType?["Requested fuel type"]:[]),...(preferences.transmission?["Requested transmission"]:[]),...(preferences.bodyType?["Requested body type"]:[])],recordVersion:v.updatedAt}));
}
export function inventoryInsights(snapshot:Snapshot,asOf=new Date()) {
  const time=asOf.getTime();if(!Number.isFinite(time))throw new Error("Invalid report date.");
  const vehicles=snapshot.vehicles.map(v=> {
    const issues:string[]=[];
    if(!Number.isFinite(v.price)||v.price<=0)issues.push("Missing valid asking price");
    if(!v.media.length)issues.push("Missing imagery");
    if(!v.stockId.trim())issues.push("Missing stock identity");
    if(!Number.isFinite(v.mileage)||v.mileage<0)issues.push("Invalid mileage");
    if(!Number.isInteger(v.year)||v.year<1900||v.year>asOf.getUTCFullYear()+1)issues.push("Invalid model year");
    const created=Date.parse(v.createdAt);
    const recordAgeDays=Number.isFinite(created)&&created<=time?Math.floor((time-created)/86400000):null;
    if(recordAgeDays===null)issues.push("Invalid record date");
    if(v.availabilityStatus==="sold"&&v.publishStatus==="published")issues.push("Sold vehicle remains published");
    if(snapshot.vehicles.some(other=>other.id!==v.id&&other.stockId===v.stockId&&other.dealershipId===v.dealershipId))issues.push("Duplicate stock identity");
    return {vehicleId:v.id,recordAgeDays,acquisitionAgeDays:null,issues,
      views:snapshot.events.filter(e=>e.vehicleId===v.id&&e.type==="vehicle_view").length,
      enquiries:snapshot.leads.filter(l=>l.vehicleId===v.id).length,
      priceChanges:(snapshot.inventoryHistory??[]).filter(h=>h.vehicleId===v.id&&h.before.price!==h.after.price),
      capitalInvested:null,holdingCost:null,margin:null};
  });
  const overdue=snapshot.tasks.filter(t=>!t.completed&&Date.parse(t.dueAt)<time);
  const open=snapshot.leads.filter(l=>!["won","lost"].includes(l.stage));
  const missingNextAction=open.filter(l=>!snapshot.tasks.some(t=>t.leadId===l.id&&!t.completed));
  const rescueCandidates=snapshot.leads.filter(l=>l.stage==="nurture"&&l.consent.marketing&&l.consent.whatsapp).map(l=>({leadId:l.id,action:"Human review of current consent and stock before contacting",sendAuthorized:false}));
  return {version:"inventory-rules-v1",asOf:asOf.toISOString(),vehicles,
    dataQuality:{total:vehicles.length,withIssues:vehicles.filter(v=>v.issues.length).length},
    briefing:{overdueTasks:overdue.map(t=>({taskId:t.id,leadId:t.leadId,owner:t.owner,dueAt:t.dueAt})),missingNextAction:missingNextAction.map(l=>({leadId:l.id,owner:l.assignedTo??"Unassigned"})),inventoryIssues:vehicles.filter(v=>v.issues.length),rescueCandidates},
    coverage:{acquisitionDates:0,vehicleCosts:0,marketObservations:0},
    unavailable:["Acquisition ageing: verified acquisition dates are not recorded", "Capital and profit: cost ledger is not configured", "Market pricing and acquisition radar: no permissioned feed connected", "AI narrative: no model provider configured"],
  };
}
