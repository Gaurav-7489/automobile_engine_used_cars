"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { PlatformTenant, StaffMember, StaffRole } from "@vandlabs/contracts";
import { staffRoles } from "@vandlabs/contracts";

export function StaffManager({tenant}:{tenant:Pick<PlatformTenant,"tenantId"|"organization"|"dealerships"|"staff">}) {
  const router=useRouter();
  const [selected,setSelected]=useState<StaffMember|null>(null);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [dealerIds,setDealerIds]=useState<string[]>([]),[locationIds,setLocationIds]=useState<string[]>([]);
  function edit(member:StaffMember|null) {
    setSelected(member);setDealerIds(member?.dealershipIds??[]);setLocationIds(member?.locationIds??[]);setMessage("");
  }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const form=new FormData(event.currentTarget);setBusy(true);setMessage("");
    try {
      const response=await fetch("/platform/api/staff",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({tenantId:tenant.tenantId,expectedVersion:selected?.version??0,member:{userId:String(form.get("userId")||""),displayName:String(form.get("displayName")||""),role:String(form.get("role")||"viewer") as StaffRole,dealershipIds:dealerIds,locationIds,enabled:form.get("enabled")==="on"}})});
      const body=await response.json();
      if(!response.ok)throw new Error(response.status===409?"Permissions changed in another session. Refresh and review before saving again.":body.error||"Unable to save staff access.");
      setSelected(body.data);setMessage("Staff access saved. The change is recorded in the audit log.");router.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"Unable to save staff access.");}finally{setBusy(false);}
  }
  return <section className="panel"><h2>Staff access · {tenant.organization}</h2>
    <p>Provision access for an existing Cognito account using its subject ID. Disabled grants stop authorizing requests when the database staff registry is selected.</p>
    <div className="stack">{tenant.staff.map(member=><div className="row" key={member.userId}><div><strong>{member.displayName}</strong><small>{member.role} · {member.enabled?"enabled":"disabled"} · version {member.version}</small></div><button type="button" onClick={()=>edit(member)}>Edit access</button></div>)}</div>
    <button type="button" onClick={()=>edit(null)}>New staff grant</button>
    <form key={selected?.userId??"new"} onSubmit={submit} className="staff-form">
      <label>Cognito subject ID<input name="userId" required readOnly={!!selected} defaultValue={selected?.userId??""} maxLength={128}/></label>
      <label>Staff name<input name="displayName" required defaultValue={selected?.displayName??""} maxLength={120}/></label>
      <label>Role<select aria-label="Role" name="role" defaultValue={selected?.role??"viewer"}>{Object.keys(staffRoles).map(role=><option key={role} value={role}>{role}</option>)}</select></label>
      <fieldset><legend>Dealership access</legend>{tenant.dealerships.map(d=><label className="check" key={d.id}><input type="checkbox" checked={dealerIds.includes(d.id)} onChange={e=>{setDealerIds(e.target.checked?[...dealerIds,d.id]:dealerIds.filter(id=>id!==d.id));if(!e.target.checked)setLocationIds(locationIds.filter(id=>!d.locations.some(l=>l.id===id)));}}/>{d.name}</label>)}</fieldset>
      <fieldset><legend>Location access</legend>{tenant.dealerships.filter(d=>dealerIds.includes(d.id)).flatMap(d=>d.locations.map(l=><label className="check" key={l.id}><input type="checkbox" checked={locationIds.includes(l.id)} onChange={e=>setLocationIds(e.target.checked?[...locationIds,l.id]:locationIds.filter(id=>id!==l.id))}/>{d.name} · {l.name}</label>))}</fieldset>
      <label className="check"><input type="checkbox" name="enabled" defaultChecked={selected?.enabled??true}/>Access enabled</label>
      <button disabled={busy||!dealerIds.length||!locationIds.length}>{busy?"Saving…":"Save staff access"}</button>
      <p role="status" aria-live="polite">{message}</p>
    </form>
  </section>;
}
