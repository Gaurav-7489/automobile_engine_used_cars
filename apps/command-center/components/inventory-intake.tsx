"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { VehicleFields, vehicleFormInput } from "./vehicle-fields";
import { InventoryImport } from "./inventory-import";
import type { Vehicle } from "@vandlabs/contracts";

export interface InventoryDestination {dealershipId:string;locationId:string;label:string}
async function save(path:string,body:unknown) {
  const response=await fetch(`/command/api/vehicles${path}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const result=await response.json();
  if(!response.ok)throw new Error(result.issues?.map((i:{row:number;field:string;message:string})=>`Row ${i.row}, ${i.field}: ${i.message}`).join(" · ")||result.error||"Could not save inventory.");
  return result.data as {vehicles:Vehicle[]};
}
export function InventoryIntake({destinations}:{destinations:InventoryDestination[]}) {
  const router=useRouter();const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [destination,setDestination]=useState(destinations[0]?.locationId??"");
  useEffect(()=>setReady(true),[]);
  const selected=destinations.find(d=>d.locationId===destination);
  const disabled=!ready||busy||!selected;
  async function run(action:()=>Promise<void>) {setBusy(true);setMessage("");try{await action();}catch(e){setMessage(e instanceof Error?e.message:"Could not save inventory.");}finally{setBusy(false);}}
  if(!destinations.length)return <p className="notice">No inventory location is assigned to your account.</p>;
  return <section className="panel inventory-intake" aria-label="Add inventory">
    <h2>Add stock</h2><p className="muted">New vehicles are saved as drafts. Verify the details and image rights before publishing. Excel/CSV imports add new identities; existing stock is edited in the table.</p>
    <label><span>Inventory destination</span><select value={destination} disabled={!ready||busy} onChange={e=>{setDestination(e.target.value);setMessage("");}}>{destinations.map(d=><option key={d.locationId} value={d.locationId}>{d.label}</option>)}</select></label>
    <details><summary>Enter a vehicle</summary>
      <form className="operations-form" onSubmit={e=>{e.preventDefault();const form=e.currentTarget;const vehicle=vehicleFormInput(form);void run(async()=>{const result=await save("",{...selected,vehicle});setMessage(`Draft saved: ${result.vehicles[0].stockId}`);form.reset();router.refresh();});}}>
        <fieldset disabled={disabled}><VehicleFields/><button>Save draft vehicle</button></fieldset>
      </form>
    </details>
    {selected ? <InventoryImport key={destination} destination={selected} disabled={disabled} onBusyChange={setBusy}/> : null}
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
