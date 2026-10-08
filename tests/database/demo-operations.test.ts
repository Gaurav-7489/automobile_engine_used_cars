import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createLead,patchLead,createTask,completeTask,staffSnapshot,ConflictError} from "../../packages/data/src/index";
import {persistRuntimeAutomationRule} from "../../packages/demo-data/src/runtime";
import {evaluateLeadAutomation} from "../../packages/demo-data/src/automation";
import type {AuthenticatedPrincipal,AutomationRule} from "../../packages/contracts/src/index";

test("demo CRM commits lead/audit/automation together and rejects stale task/lead edits",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"vandlabs-crm-"));const previous=process.env.VANDLABS_DEMO_RUNTIME_PATH;process.env.VANDLABS_DEMO_RUNTIME_PATH=join(dir,"leads.json");
 try {
  const p:AuthenticatedPrincipal={userId:"staff",tenantId:"tenant-apex",dealershipIds:["dealer-select"],locationIds:["loc-bengaluru"],capabilities:["lead:read","lead:write","task:write","inventory:read","analytics:read"]};
  const created=await createLead({tenantId:p.tenantId,dealershipId:p.dealershipIds[0],locationId:p.locationIds[0],name:"Demo buyer",phone:"123",vehicleIds:[],channel:"web",source:"website",intent:"enquiry",consent:{whatsapp:true,marketing:false}});
  const id=created.lead.id;assert.equal(created.lead.version,0);assert.equal(created.automation.filter(r=>r.outcome==="created").length,1);
  const changed=await patchLead(p,id,{stage:"qualified",notes:"Reviewed"},0);assert.equal(changed.data.version,1);assert.equal(changed.automation.length,1);
  const before=await readFile(join(dir,"state.json"),"utf8");
  await assert.rejects(patchLead(p,id,{notes:"Old draft"},0),ConflictError);assert.equal(await readFile(join(dir,"state.json"),"utf8"),before);
  const task=await createTask(p,id,{title:"Call",owner:"Staff",dueAt:"2030-01-01T10:00:00Z",priority:"normal"});await completeTask(p,task.data.id,true,0);
  await assert.rejects(completeTask(p,task.data.id,false,0),ConflictError);assert.equal((await staffSnapshot(p)).tasks.find(t=>t.id===task.data.id)?.completed,true);
  const rule:AutomationRule={id:"rule-invalid-contacted",tenantId:p.tenantId,name:"Invalid configured rule",enabled:true,trigger:"stage_changed",stages:["contacted"],delayMinutes:1e20,taskTitle:"Invalid",ownerFallback:"Staff",priority:"normal",channel:"internal_task",requiresWhatsappConsent:false};
  assert.ok(persistRuntimeAutomationRule(rule));const rollbackBefore=await readFile(join(dir,"state.json"),"utf8");
  await assert.rejects(patchLead(p,id,{stage:"contacted",notes:"Must roll back"},1),/Invalid time value/);
  assert.equal(await readFile(join(dir,"state.json"),"utf8"),rollbackBefore);
  const held=evaluateLeadAutomation(created.lead,"stage_changed",[{...rule,id:"provider",stages:undefined,delayMinutes:0,channel:"whatsapp",requiresWhatsappConsent:true}],[]);
  assert.equal(held.tasks.length,0);assert.equal(held.runs[0].outcome,"skipped_provider");
  const noConsent=evaluateLeadAutomation({...created.lead,consent:{whatsapp:false,marketing:false}},"stage_changed",[{...rule,id:"provider",stages:undefined,delayMinutes:0,channel:"whatsapp",requiresWhatsappConsent:true}],[]);assert.equal(noConsent.runs[0].outcome,"skipped_consent");
 } finally {if(previous===undefined)delete process.env.VANDLABS_DEMO_RUNTIME_PATH;else process.env.VANDLABS_DEMO_RUNTIME_PATH=previous;await rm(dir,{recursive:true,force:true});}
});
