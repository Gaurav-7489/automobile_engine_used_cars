"use client";
import type { Vehicle } from "@vandlabs/contracts";
export function vehicleFormInput(form:HTMLFormElement) {
  const f=new FormData(form),vehicle:Record<string,unknown>=Object.fromEntries(f.entries());
  for(const field of ["year","price","mileage","ownership"])vehicle[field]=Number(vehicle[field]);
  vehicle.financeEligible=f.get("financeEligible")==="on";vehicle.exchangeEligible=f.get("exchangeEligible")==="on";
  return vehicle;
}
export function VehicleFields({vehicle}:{vehicle?:Vehicle}) {
  return <div className="operations-grid">
    {[['stockId','Stock ID'],['make','Make'],['model','Model'],['variant','Variant'],['bodyType','Body style'],['exteriorColor','Exterior colour'],['interiorColor','Interior colour']].map(([name,label])=><label key={name}><span>{label}</span><input name={name} required readOnly={name==="stockId"&&!!vehicle} defaultValue={vehicle?.[name as keyof Vehicle] as string|undefined} maxLength={name==="stockId"?64:120}/></label>)}
    <label><span>Model year</span><input name="year" type="number" min="1900" max={new Date().getFullYear()+1} defaultValue={vehicle?.year} required/></label>
    <label><span>Asking price (INR)</span><input name="price" type="number" min="0.01" step="0.01" defaultValue={vehicle?.price} required/></label>
    <label><span>Mileage (km)</span><input name="mileage" type="number" min="0" step="1" defaultValue={vehicle?.mileage} required/></label>
    <label><span>Owner count</span><input name="ownership" type="number" min="1" max="20" defaultValue={vehicle?.ownership??1} required/></label>
    <label><span>Fuel</span><select name="fuelType" defaultValue={vehicle?.fuelType}>{["petrol","diesel","hybrid","electric"].map(v=><option key={v}>{v}</option>)}</select></label>
    <label><span>Transmission</span><select name="transmission" defaultValue={vehicle?.transmission}><option>manual</option><option>automatic</option></select></label>
    <label><span>Condition</span><select name="condition" defaultValue={vehicle?.condition}>{["excellent","good","fair"].map(v=><option key={v}>{v}</option>)}</select></label>
    <label><span>HTTPS image URL (optional for draft)</span><input name="imageUrl" type="url" maxLength={2048} defaultValue={vehicle?.media[0]?.url}/></label>
    <label><span><input name="financeEligible" type="checkbox" defaultChecked={vehicle?.financeEligible}/> Finance eligible</span></label>
    <label><span><input name="exchangeEligible" type="checkbox" defaultChecked={vehicle?.exchangeEligible}/> Exchange eligible</span></label>
  </div>;
}
