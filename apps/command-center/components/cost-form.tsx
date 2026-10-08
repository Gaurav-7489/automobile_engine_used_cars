"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StockCost } from "@vandlabs/contracts";
export function CostForm({vehicleId,record}:{vehicleId:string;record?:StockCost}) {
  const router=useRouter(),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  return <details onToggle={e=>setOpen(e.currentTarget.open)}><summary>{record?"Amend costs":"Record costs"}</summary>{open?<form className="operations-form" key={record?.version??0} onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const values={acquiredOn:String(f.get("acquiredOn")),purchasePrice:Number(f.get("purchasePrice")),reconditioningCost:Number(f.get("reconditioningCost")),transferCost:Number(f.get("transferCost")),otherCost:Number(f.get("otherCost")),dailyHoldingCost:f.get("dailyHoldingCost")===""?null:Number(f.get("dailyHoldingCost")),reference:String(f.get("reference"))};setBusy(true);setMessage("");void(async()=>{try{const response=await fetch(`/command/api/vehicles/${vehicleId}/costs`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({record:values,expectedVersion:record?.version??0})});if(!response.ok){const result=await response.json();throw new Error(result.error||"Could not save costs.");}setMessage("Costs saved");router.refresh();}catch(err){setMessage(err instanceof Error?err.message:"Could not save costs.");}finally{setBusy(false);}})();}}><fieldset disabled={busy}>
    <label><span>Acquired on</span><input name="acquiredOn" type="date" defaultValue={record?.acquiredOn} required/></label>
    {[["purchasePrice","Verified purchase price"],["reconditioningCost","Recorded reconditioning cost"],["transferCost","Recorded transfer cost"],["otherCost","Other recorded costs"]].map(([name,label])=><label key={name}><span>{label} (INR)</span><input name={name} type="number" min={name==="purchasePrice"?"0.01":"0"} step="0.01" required defaultValue={record?.[name as keyof StockCost] as number|undefined}/></label>)}
    <label><span>Daily holding assumption (INR, optional)</span><input name="dailyHoldingCost" type="number" min="0" step="0.01" defaultValue={record?.dailyHoldingCost??undefined}/></label>
    <label><span>Invoice / internal reference</span><input name="reference" maxLength={120} defaultValue={record?.reference} required/></label>
    <label><span><input type="checkbox" required/> I verified these costs and am authorized to record them.</span></label><button>Save verified costs</button>
  </fieldset></form>:null}<small role="status">{message}</small></details>;
}
