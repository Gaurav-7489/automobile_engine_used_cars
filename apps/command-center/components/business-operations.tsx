"use client";
import { VehicleFields, vehicleFormInput } from "./vehicle-fields";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Appointment, Sale, Vehicle } from "@vandlabs/contracts";
async function mutation(path:string,body:unknown,method="POST") {
  const response=await fetch(`/command/api${path}`,{method,headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  if(!response.ok){const result=await response.json();throw new Error(result.error||"Could not save. Please retry.");}
}
function useMutation() {
  const router=useRouter();const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  async function run(action:()=>Promise<void>) {setBusy(true);setMessage("");try{await action();setMessage("Saved");router.refresh();}catch(e){setMessage(e instanceof Error?e.message:"Could not save");}finally{setBusy(false);}}
  return {busy,message,run};
}
export function AppointmentForm({leadId}:{leadId:string}) {
  const {busy,message,run}=useMutation();
  return <form className="operations-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run(()=>mutation(`/leads/${leadId}/appointments`,{type:f.get("type"),scheduledAt:new Date(String(f.get("scheduledAt"))).toISOString()}));}}>
    <div className="operations-grid"><label><span>Visit type</span><select name="type"><option value="appointment">Showroom visit</option><option value="test_drive">Test drive</option></select></label><label><span>Confirmed visit time</span><input name="scheduledAt" type="datetime-local" required/></label></div>
    <p className="notice">Confirm the time with the customer before scheduling. An internal reminder is created.</p><div className="operations-actions"><button disabled={busy}>Schedule appointment</button><span role="status">{message}</span></div>
  </form>;
}
export function AppointmentStatus({appointment}:{appointment:Appointment}) {
  const {busy,message,run}=useMutation();
  return <label><span>Visit status</span><select aria-label="Visit status" value={appointment.status} disabled={busy} onChange={e=>void run(()=>mutation(`/appointments/${appointment.id}`,{status:e.target.value},"PATCH"))}>{["scheduled","completed","cancelled","no_show"].map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</select><small role="status">{message}</small></label>;
}
export function SaleForm({leadId,sale}:{leadId:string;sale?:Sale}) {
  const {busy,message,run}=useMutation();
  if(sale)return <p>Confirmed sale: ₹{sale.amount.toLocaleString("en-IN")} · {new Date(sale.soldAt).toLocaleDateString("en-IN")}<br/><small>Recorded by {sale.confirmedBy}. Corrections require an approved reversal.</small></p>;
  return <form className="operations-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run(()=>mutation(`/leads/${leadId}/sales`,{amount:Number(f.get("amount")),soldAt:new Date(String(f.get("soldAt"))).toISOString()}));}}>
    <div className="operations-grid"><label><span>Verified sale price (INR)</span><input type="number" name="amount" required min="0.01" step="0.01"/></label><label><span>Actual sale time</span><input type="datetime-local" name="soldAt" required/></label></div><label><span><input type="checkbox" required/> I verified this sale and am authorized to record it.</span></label>
    <p className="notice">Confirmation marks the lead Won, withdraws the vehicle from the website, and closes its open follow-ups. Sale proceeds are not profit.</p><div className="operations-actions"><button disabled={busy}>Confirm sale</button><span role="status">{message}</span></div>
  </form>;
}
export function InventoryOperations({vehicle}:{vehicle:Vehicle}) {
  const {busy,message,run}=useMutation();const [editing,setEditing]=useState(false);
  return <><form className="operations-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void run(()=>mutation(`/vehicles/${vehicle.id}`,{price:Number(f.get("price")),availabilityStatus:f.get("availability"),publishStatus:f.get("publication"),expectedVersion:vehicle.version??0},"PATCH"));}}>
    <label><span>Asking price</span><input aria-label={`Price ${vehicle.stockId}`} key={vehicle.price} name="price" type="number" min="0" step="0.01" defaultValue={vehicle.price} required/></label>
    <label><span>Availability</span><select name="availability" key={vehicle.availabilityStatus} defaultValue={vehicle.availabilityStatus}>{["available","reserved","sold"].map(s=><option key={s}>{s}</option>)}</select></label>
    <label><span>Publication</span><select name="publication" key={vehicle.publishStatus} defaultValue={vehicle.publishStatus}>{["draft","published","archived"].map(s=><option key={s}>{s}</option>)}</select></label>
    <button disabled={busy}>Save inventory</button><small role="status">{message}</small>
  </form>{vehicle.availabilityStatus!=="sold"?<details onToggle={e=>setEditing(e.currentTarget.open)}><summary>Edit vehicle details</summary>{editing?<form className="operations-form" onSubmit={e=>{e.preventDefault();const details=vehicleFormInput(e.currentTarget);void run(()=>mutation(`/vehicles/${vehicle.id}`,{vehicle:details,expectedVersion:vehicle.version??0},"PUT"));}}><fieldset disabled={busy}><VehicleFields vehicle={vehicle} key={vehicle.updatedAt}/><button>Save vehicle details</button></fieldset></form>:null}</details>:null}</>;
}
