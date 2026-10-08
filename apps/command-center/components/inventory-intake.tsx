"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { VehicleFields, vehicleFormInput } from "./vehicle-fields";
import type { Vehicle } from "@vandlabs/contracts";

export interface InventoryDestination {dealershipId:string;locationId:string;label:string}
const columns="stockId,make,model,variant,year,price,mileage,fuelType,transmission,ownership,bodyType,condition,exteriorColor,interiorColor,imageUrl,financeEligible,exchangeEligible";
async function save(path:string,body:unknown) {
  const response=await fetch(`/command/api/vehicles${path}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const result=await response.json();
  if(!response.ok)throw new Error(result.issues?.map((i:{row:number;field:string;message:string})=>`Row ${i.row}, ${i.field}: ${i.message}`).join(" · ")||result.error||"Could not save inventory.");
  return result.data as {vehicles:Vehicle[]};
}
export function InventoryIntake({destinations}:{destinations:InventoryDestination[]}) {
  const router=useRouter();const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [destination,setDestination]=useState(destinations[0]?.locationId??""),[csv,setCsv]=useState(""),[preview,setPreview]=useState<Vehicle[]>([]);
  useEffect(()=>setReady(true),[]);
  const selected=destinations.find(d=>d.locationId===destination);
  const disabled=!ready||busy||!selected;
  async function run(action:()=>Promise<void>) {setBusy(true);setMessage("");try{await action();}catch(e){setMessage(e instanceof Error?e.message:"Could not save inventory.");}finally{setBusy(false);}}
  if(!destinations.length)return <p className="notice">No inventory location is assigned to your account.</p>;
  return <section className="panel inventory-intake" aria-label="Add inventory">
    <h2>Add stock</h2><p className="muted">New vehicles are saved as drafts. Verify the details and image rights before publishing. CSV imports add new identities; existing stock is edited in the table.</p>
    <label><span>Inventory destination</span><select value={destination} disabled={!ready||busy} onChange={e=>{setDestination(e.target.value);setPreview([]);setMessage("");}}>{destinations.map(d=><option key={d.locationId} value={d.locationId}>{d.label}</option>)}</select></label>
    <details><summary>Enter a vehicle</summary>
      <form className="operations-form" onSubmit={e=>{e.preventDefault();const form=e.currentTarget;const vehicle=vehicleFormInput(form);void run(async()=>{const result=await save("",{...selected,vehicle});setMessage(`Draft saved: ${result.vehicles[0].stockId}`);form.reset();router.refresh();});}}>
        <fieldset disabled={disabled}><VehicleFields/><button>Save draft vehicle</button></fieldset>
      </form>
    </details>
    <details><summary>Import CSV</summary>
      <p>Export Excel as UTF-8 CSV. Maximum 200 rows / 250 KB. Preview validates every row; commit rechecks identities and saves the whole batch together.</p>
      <a download="vandlabs-inventory-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(columns+"\n")}`}>Download CSV template</a>
      <label><span>CSV file</span><input disabled={disabled} type="file" accept=".csv,text/csv" onChange={e=>{const file=e.target.files?.[0];setPreview([]);setMessage("");if(!file)return;if(file.size>250000){setCsv("");setMessage("Choose a CSV up to 250 KB.");return;}void run(async()=>{setCsv(await file.text());});}}/></label>
      <label><span>CSV contents</span><textarea disabled={disabled} rows={6} value={csv} maxLength={250000} onChange={e=>{setCsv(e.target.value);setPreview([]);setMessage("");}}/></label>
      <button disabled={disabled||!csv} onClick={()=>void run(async()=>{setPreview([]);const result=await save("/import",{...selected,csv,mode:"preview"});setPreview(result.vehicles);setMessage(`${result.vehicles.length} valid drafts ready for review.`);})}>Preview import</button>
      {preview.length?<><div className="table-scroll"><table><thead><tr><th>Stock</th><th>Vehicle</th><th>Price (INR)</th><th>Mileage / Fuel / Gearbox</th><th>Owners / Condition</th><th>Colours / Image</th><th>State</th></tr></thead><tbody>{preview.map(v=><tr key={v.id}><td>{v.stockId}</td><td>{v.year} {v.make} {v.model} {v.variant}</td><td>{v.price.toLocaleString("en-IN")}</td><td>{v.mileage.toLocaleString("en-IN")} km · {v.fuelType} · {v.transmission}</td><td>{v.ownership} · {v.condition}</td><td>{v.exteriorColor} / {v.interiorColor} · {v.media.length?"Image provided":"No image"}</td><td>Draft</td></tr>)}</tbody></table></div><button disabled={disabled} onClick={()=>void run(async()=>{const result=await save("/import",{...selected,csv,mode:"commit"});setPreview([]);setCsv("");setMessage(`Imported ${result.vehicles.length} draft vehicles.`);router.refresh();})}>Import {preview.length} drafts</button></>:null}
    </details>
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
