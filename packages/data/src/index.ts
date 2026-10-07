import { randomUUID } from "node:crypto";
import type { AuthenticatedPrincipal, Lead, LeadActivity, LeadStage, Task, Vehicle, Appointment, JourneyEvent, AutomationRule, AutomationRun, AnalyticsSnapshot } from "@vandlabs/contracts";
import { requireCapability, requireTenant, requireDealership, requireLocation } from "@vandlabs/contracts";
import * as demo from "@vandlabs/demo-data";
import * as runtime from "@vandlabs/demo-data/runtime";
import { getAutomationRules, runLeadAutomation } from "@vandlabs/demo-data/automation";
import { dataMode, publicScope, tenantConfig } from "./config";
import { databasePool, tenantTransaction, type SqlClient, type SqlPool } from "./postgres";
export { dataMode, tenantConfig, publicScope } from "./config";
export class InputError extends Error {}
export class RecordNotFound extends Error {}
export interface Snapshot {
  leads: Lead[]; tasks: Task[]; vehicles: Vehicle[]; appointments: Appointment[];
  activities: LeadActivity[]; events: JourneyEvent[]; rules: AutomationRule[]; runs: AutomationRun[];
}
function payloads<T>(rows: Record<string, unknown>[]): T[] { return rows.map((row) => row.payload as T); }
function decodeLead(row: Record<string, unknown>): Lead {
  return { ...(row.payload as Lead), id: row.id as string, tenantId: row.tenant_id as string,
    dealershipId: row.dealership_id as string, locationId: row.location_id as string | undefined,
    vehicleId: row.vehicle_id as string | undefined, stage: row.stage as LeadStage,
    source: row.source as string, campaign: row.campaign as string | undefined,
    createdAt: new Date(row.created_at as string).toISOString(), updatedAt: new Date(row.updated_at as string).toISOString() };
}
function decodeVehicle(row: Record<string, unknown>): Vehicle {
  return { ...(row.payload as Vehicle), id: row.id as string, tenantId: row.tenant_id as string,
    dealershipId: row.dealership_id as string, locationId: row.location_id as string,
    slug: row.slug as string, publishStatus: row.publish_status as Vehicle["publishStatus"],
    availabilityStatus: row.availability_status as Vehicle["availabilityStatus"],
    updatedAt: new Date(row.updated_at as string).toISOString() };
}
function scope(principal: AuthenticatedPrincipal, lead: Lead, capability: "lead:write" | "task:write") {
  requireCapability(principal, capability); requireTenant(principal, lead.tenantId);
  requireDealership(principal, lead.dealershipId); if (lead.locationId) requireLocation(principal, lead.locationId);
}
function demoSnapshot(): Snapshot {
  return { leads: runtime.mergeRuntimeLeads(demo.leads), tasks: runtime.mergeRuntimeTasks(demo.tasks), vehicles: demo.vehicles,
    appointments: demo.appointments, activities: runtime.readRuntimeLeadActivities(), events: runtime.readRuntimeJourneyEvents(),
    rules: getAutomationRules(tenantConfig.tenantId), runs: runtime.readRuntimeAutomationRuns() };
}
function visible(p: AuthenticatedPrincipal, r: {tenantId:string;dealershipId:string;locationId?:string}) {
  return p.tenantId === r.tenantId && p.dealershipIds.includes(r.dealershipId) && (!r.locationId || p.locationIds.includes(r.locationId));
}
async function activity(client: SqlClient, item: LeadActivity) {
  await client.query("INSERT INTO lead_activities(id,tenant_id,lead_id,payload,occurred_at) VALUES($1,$2,$3,$4,$5)", [item.id,item.tenantId,item.leadId,item,item.occurredAt]);
}
async function saveTask(client: SqlClient, task: Task) {
  await client.query(`INSERT INTO tasks(id,tenant_id,lead_id,payload,due_at,completed) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,due_at=EXCLUDED.due_at,completed=EXCLUDED.completed`,
    [task.id,task.tenantId,task.leadId,task,task.dueAt,task.completed]);
}
async function automate(client: SqlClient, lead: Lead, trigger: AutomationRule["trigger"]) {
  const rules = payloads<AutomationRule>((await client.query("SELECT payload FROM automation_rules WHERE tenant_id=$1", [lead.tenantId])).rows);
  const runs: AutomationRun[] = [];
  for (const rule of rules.filter((r) => r.enabled && r.trigger === trigger && (!r.stages?.length || r.stages.includes(lead.stage)) && (!r.intents?.length || r.intents.includes(lead.intent)))) {
    const previous = await client.query("SELECT id FROM automation_runs WHERE tenant_id=$1 AND lead_id=$2 AND rule_id=$3 AND trigger=$4 AND outcome='created'", [lead.tenantId,lead.id,rule.id,trigger]);
    const outcome = previous.rows.length ? "skipped_duplicate" : rule.channel === "whatsapp" ? "skipped_consent" : "created";
    const task: Task | undefined = outcome === "created" ? { id: randomUUID(), tenantId: lead.tenantId, leadId: lead.id,
      title: rule.taskTitle, owner: lead.assignedTo || rule.ownerFallback, dueAt: new Date(Date.now()+rule.delayMinutes*60000).toISOString(),
      completed:false, priority:rule.priority,origin:"automation",automationRuleId:rule.id } : undefined;
    if (task) await saveTask(client,task);
    const run: AutomationRun = {id:randomUUID(),tenantId:lead.tenantId,leadId:lead.id,ruleId:rule.id,trigger,outcome,taskId:task?.id,occurredAt:new Date().toISOString()};
    await client.query("INSERT INTO automation_runs(id,tenant_id,lead_id,rule_id,trigger,outcome,payload) VALUES($1,$2,$3,$4,$5,$6,$7)", [run.id,run.tenantId,run.leadId,run.ruleId,run.trigger,run.outcome,run]);
    runs.push(run);
  }
  return runs;
}
export function postgresStore(pool: SqlPool) {
  const tx = <T>(tenantId:string, action:(c:SqlClient)=>Promise<T>) => tenantTransaction(pool,tenantId,action);
  async function lockedLead(c: SqlClient,p:AuthenticatedPrincipal,id:string,capability:"lead:write"|"task:write") {
    requireCapability(p,capability);
    const row = (await c.query("SELECT * FROM leads WHERE id=$1 AND tenant_id=$2 FOR UPDATE", [id,p.tenantId])).rows[0];
    if (!row) throw new RecordNotFound();
    const lead=decodeLead(row); scope(p,lead,capability); return lead;
  }
  return {
    inventory(tenantId:string, dealershipId:string) { return tx(tenantId,async c=> (await c.query("SELECT * FROM vehicles WHERE tenant_id=$1 AND dealership_id=$2 AND publish_status='published' ORDER BY created_at DESC",[tenantId,dealershipId])).rows.map(decodeVehicle)); },
    snapshot(p:AuthenticatedPrincipal) { return tx(p.tenantId,async c=> {
      for (const cap of ["lead:read","inventory:read","analytics:read"] as const) requireCapability(p,cap);
      const args=[p.tenantId,p.dealershipIds,p.locationIds];
      const predicate="l.tenant_id=$1 AND l.dealership_id=ANY($2::uuid[]) AND (l.location_id IS NULL OR l.location_id=ANY($3::uuid[]))";
      const leads=(await c.query(`SELECT l.* FROM leads l WHERE ${predicate} ORDER BY created_at DESC`,args)).rows.map(decodeLead);
      const vehicles=(await c.query("SELECT * FROM vehicles WHERE tenant_id=$1 AND dealership_id=ANY($2::uuid[]) AND location_id=ANY($3::uuid[]) ORDER BY created_at DESC",args)).rows.map(decodeVehicle);
      const related=async <T>(table:string)=>payloads<T>((await c.query(`SELECT r.payload FROM ${table} r JOIN leads l ON l.id=r.lead_id AND l.tenant_id=r.tenant_id WHERE ${predicate}`,args)).rows);
      return { leads,vehicles,tasks:await related<Task>("tasks"),activities:await related<LeadActivity>("lead_activities"),appointments:await related<Appointment>("appointments"),
        runs:await related<AutomationRun>("automation_runs"),events:payloads<JourneyEvent>((await c.query("SELECT to_jsonb(e) || jsonb_build_object('tenantId',e.tenant_id,'sessionId',e.session_id,'vehicleId',e.vehicle_id,'type',e.event_type,'occurredAt',e.occurred_at) AS payload FROM journey_events e JOIN vehicles v ON v.id=e.vehicle_id AND v.tenant_id=e.tenant_id WHERE e.tenant_id=$1 AND v.dealership_id=ANY($2::uuid[]) AND v.location_id=ANY($3::uuid[])",args)).rows),
        rules:payloads<AutomationRule>((await c.query("SELECT payload FROM automation_rules WHERE tenant_id=$1",[p.tenantId])).rows) };
    }); },
    createLead(input:Omit<Lead,"id"|"stage"|"createdAt"|"updatedAt">) { return tx(input.tenantId,async c=> {
      if (input.vehicleId) {
        const vehicle=(await c.query("SELECT * FROM vehicles WHERE id=$1 AND tenant_id=$2 AND dealership_id=$3 AND publish_status='published' AND availability_status='available' FOR SHARE",[input.vehicleId,input.tenantId,input.dealershipId])).rows[0];
        if (!vehicle || vehicle.location_id !== input.locationId) throw new InputError("Vehicle is unavailable.");
      }
      const now=new Date().toISOString(); const lead:Lead={...input,id:randomUUID(),stage:"new",createdAt:now,updatedAt:now};
      await c.query("INSERT INTO leads(id,tenant_id,dealership_id,location_id,vehicle_id,payload,stage,source,campaign,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)",[lead.id,lead.tenantId,lead.dealershipId,lead.locationId,lead.vehicleId,lead,lead.stage,lead.source,lead.campaign,now]);
      return {lead,automation:await automate(c,lead,"lead_created")};
    }); },
    patchLead(p:AuthenticatedPrincipal,id:string,patch:Partial<Pick<Lead,"stage"|"assignedTo"|"notes">>) { return tx(p.tenantId,async c=> {
      const lead=await lockedLead(c,p,id,"lead:write"); const updated={...lead,...patch,updatedAt:new Date().toISOString()};
      const records:LeadActivity[]=[];
      for (const [field,type] of [["stage","stage_changed"],["assignedTo","assignment_changed"],["notes","note_updated"]] as const) {
        if (updated[field]!==lead[field]) records.push({id:randomUUID(),tenantId:lead.tenantId,leadId:id,type,actor:p.userId,description:`${field} updated.`,occurredAt:updated.updatedAt});
      }
      await c.query("UPDATE leads SET payload=$1,stage=$2,updated_at=$3 WHERE id=$4 AND tenant_id=$5",[updated,updated.stage,updated.updatedAt,id,p.tenantId]);
      for (const item of records) await activity(c,item);
      return {data:updated,activity:records,automation:updated.stage!==lead.stage?await automate(c,updated,"stage_changed"):[]};
    }); },
    createTask(p:AuthenticatedPrincipal,id:string,input:Pick<Task,"title"|"owner"|"dueAt"|"priority">) { return tx(p.tenantId,async c=> {
      const lead=await lockedLead(c,p,id,"task:write");const task:Task={...input,id:randomUUID(),tenantId:p.tenantId,leadId:id,completed:false,origin:"human"};
      const record:LeadActivity={id:randomUUID(),tenantId:lead.tenantId,leadId:id,type:"follow_up_created",actor:p.userId,description:`Follow-up scheduled for ${task.owner}.`,occurredAt:new Date().toISOString()};
      await saveTask(c,task);await activity(c,record);return {data:task,activity:record};
    }); },
    completeTask(p:AuthenticatedPrincipal,id:string,completed:boolean) { return tx(p.tenantId,async c=> {
      requireCapability(p,"task:write"); const row=(await c.query("SELECT payload FROM tasks WHERE id=$1 AND tenant_id=$2 FOR UPDATE",[id,p.tenantId])).rows[0];
      if (!row) throw new RecordNotFound();const task=row.payload as Task; await lockedLead(c,p,task.leadId,"task:write");
      const updated={...task,completed};const record:LeadActivity={id:randomUUID(),tenantId:p.tenantId,leadId:task.leadId,type:completed?"follow_up_completed":"follow_up_reopened",actor:p.userId,description:`Follow-up ${completed?"completed":"reopened"}: ${task.title}.`,occurredAt:new Date().toISOString()};
      await saveTask(c,updated);await activity(c,record);return {data:updated,activity:record};
    }); },
    saveEvent(event:JourneyEvent,dealershipId:string) { return tx(event.tenantId,async c=> {
      if (event.vehicleId && !(await c.query("SELECT id FROM vehicles WHERE id=$1 AND tenant_id=$2 AND dealership_id=$3 AND publish_status='published'",[event.vehicleId,event.tenantId,dealershipId])).rows.length) throw new InputError("Unknown vehicle.");
      await c.query("INSERT INTO journey_events(id,tenant_id,session_id,vehicle_id,event_type,source,campaign,path,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[event.id,event.tenantId,event.sessionId,event.vehicleId,event.type,event.source,event.campaign,event.path,event.occurredAt]);
    }); },
    updateVehicle(p:AuthenticatedPrincipal,id:string,patch:Pick<Vehicle,"price"|"availabilityStatus"|"publishStatus">) { return tx(p.tenantId,async c=> {
      requireCapability(p,"inventory:write");const row=(await c.query("SELECT * FROM vehicles WHERE id=$1 AND tenant_id=$2 FOR UPDATE",[id,p.tenantId])).rows[0];
      if (!row) throw new RecordNotFound();const vehicle=decodeVehicle(row);requireDealership(p,vehicle.dealershipId);requireLocation(p,vehicle.locationId);
      const updated={...vehicle,price:patch.price,availabilityStatus:patch.availabilityStatus,publishStatus:patch.publishStatus,updatedAt:new Date().toISOString()};
      await c.query("UPDATE vehicles SET payload=$1,availability_status=$2,publish_status=$3,updated_at=$4 WHERE id=$5 AND tenant_id=$6",[updated,updated.availabilityStatus,updated.publishStatus,updated.updatedAt,id,p.tenantId]);return updated;
    }); },
  };
}
async function productionStore() { return postgresStore(await databasePool()); }
export async function publicInventory() {
  const s=publicScope(); return dataMode()==="aurora"?(await productionStore()).inventory(s.tenantId,s.dealershipId):demo.vehicles.filter(v=>v.publishStatus==="published");
}
export async function staffSnapshot(p:AuthenticatedPrincipal):Promise<Snapshot> {
  if (dataMode()==="aurora") return (await productionStore()).snapshot(p);
  for(const cap of ["lead:read","inventory:read","analytics:read"] as const) requireCapability(p,cap);
  const s=demoSnapshot();s.leads=s.leads.filter(l=>visible(p,l));s.vehicles=s.vehicles.filter(v=>visible(p,v));
  const ids=new Set(s.leads.map(l=>l.id));s.tasks=s.tasks.filter(t=>ids.has(t.leadId));s.activities=s.activities.filter(a=>ids.has(a.leadId));s.appointments=s.appointments.filter(a=>ids.has(a.leadId));s.runs=s.runs.filter(r=>ids.has(r.leadId));const vehicleIds=new Set(s.vehicles.map(v=>v.id));s.events=s.events.filter(e=>!!e.vehicleId&&vehicleIds.has(e.vehicleId));return s;
}
export async function createLead(input:Omit<Lead,"id"|"stage"|"createdAt"|"updatedAt">) {
  const s=publicScope();if(input.tenantId!==s.tenantId||input.dealershipId!==s.dealershipId) throw new InputError("Invalid dealership.");
  if(dataMode()==="aurora")return(await productionStore()).createLead(input);
  const now=new Date().toISOString();const lead:Lead={...input,id:randomUUID(),stage:"new",createdAt:now,updatedAt:now};
  if(!runtime.persistRuntimeLead(lead))throw new Error("Lead persistence failed.");return{lead,automation:runLeadAutomation(lead,"lead_created")};
}
export async function patchLead(p:AuthenticatedPrincipal,id:string,patch:Partial<Pick<Lead,"stage"|"assignedTo"|"notes">>) {
  if(dataMode()==="aurora")return(await productionStore()).patchLead(p,id,patch);
  const lead=demoSnapshot().leads.find(l=>l.id===id);if(!lead)throw new RecordNotFound();scope(p,lead,"lead:write");
  const updated={...lead,...patch,updatedAt:new Date().toISOString()}; const records:LeadActivity[]=[];
  for(const [field,type] of [["stage","stage_changed"],["assignedTo","assignment_changed"],["notes","note_updated"]] as const)if(updated[field]!==lead[field])records.push({id:randomUUID(),tenantId:lead.tenantId,leadId:id,type,actor:p.userId,description:field==="notes"?"Internal lead note updated.":`${field} updated.`,occurredAt:updated.updatedAt});
  if(!runtime.persistRuntimeLead(updated)||!runtime.persistRuntimeLeadActivities(records))throw new Error("Persistence failed.");
  return{data:updated,activity:records,automation:updated.stage!==lead.stage?runLeadAutomation(updated,"stage_changed"):[]};
}
export async function createTask(p:AuthenticatedPrincipal,id:string,input:Pick<Task,"title"|"owner"|"dueAt"|"priority">) {
  if(dataMode()==="aurora")return(await productionStore()).createTask(p,id,input);
  const lead=demoSnapshot().leads.find(l=>l.id===id);if(!lead)throw new RecordNotFound();scope(p,lead,"task:write");
  const task:Task={...input,id:randomUUID(),tenantId:p.tenantId,leadId:id,completed:false}; const record:LeadActivity={id:randomUUID(),tenantId:p.tenantId,leadId:id,type:"follow_up_created",actor:p.userId,description:`Follow-up scheduled for ${task.owner}.`,occurredAt:new Date().toISOString()};
  if(!runtime.persistRuntimeTask(task)||!runtime.persistRuntimeLeadActivities([record]))throw new Error("Persistence failed.");return{data:task,activity:record};
}
export async function completeTask(p:AuthenticatedPrincipal,id:string,completed:boolean) {
  if(dataMode()==="aurora")return(await productionStore()).completeTask(p,id,completed);
  const s=demoSnapshot();const task=s.tasks.find(t=>t.id===id);const lead=s.leads.find(l=>l.id===task?.leadId);if(!task||!lead)throw new RecordNotFound();scope(p,lead,"task:write");
  const updated={...task,completed}; const record:LeadActivity={id:randomUUID(),tenantId:p.tenantId,leadId:lead.id,type:completed?"follow_up_completed":"follow_up_reopened",actor:p.userId,description:`Follow-up ${completed?"completed":"reopened"}: ${task.title}.`,occurredAt:new Date().toISOString()};
  if(!runtime.persistRuntimeTask(updated)||!runtime.persistRuntimeLeadActivities([record]))throw new Error("Persistence failed.");return{data:updated,activity:record};
}
export async function saveEvent(event:JourneyEvent) {
  const s=publicScope();if(dataMode()==="aurora")return(await productionStore()).saveEvent(event,s.dealershipId);
  if(!runtime.persistRuntimeJourneyEvent(event))throw new Error("Event persistence failed.");
}
export async function updateVehicle(p:AuthenticatedPrincipal,id:string,patch:Pick<Vehicle,"price"|"availabilityStatus"|"publishStatus">) {
  if(dataMode()!=="aurora")throw new InputError("Inventory editing requires shared database mode.");return(await productionStore()).updateVehicle(p,id,patch);
}
export function metrics(s:Snapshot):AnalyticsSnapshot {
  const stages:AnalyticsSnapshot["stageCounts"]={};const sources:Record<string,number>={};
  for(const l of s.leads){stages[l.stage]=(stages[l.stage]||0)+1;sources[l.source]=(sources[l.source]||0)+1;}
  return {inventory:s.vehicles.length,available:s.vehicles.filter(v=>v.availabilityStatus==="available").length,reserved:s.vehicles.filter(v=>v.availabilityStatus==="reserved").length,sold:s.vehicles.filter(v=>v.availabilityStatus==="sold").length,leads:s.leads.length,uncontacted:stages.new||0,qualified:stages.qualified||0,appointments:s.appointments.filter(a=>a.status==="scheduled").length,testDrives:stages.test_drive||0,negotiations:stages.negotiation||0,wins:stages.won||0,stageCounts:stages,sourceCounts:sources,vehicleDemand:s.vehicles.map(v=>({vehicleId:v.id,views:s.events.filter(e=>e.vehicleId===v.id&&e.type==="vehicle_view").length,enquiries:s.leads.filter(l=>l.vehicleId===v.id).length}))};
}
