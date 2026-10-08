import { randomUUID } from "node:crypto";
import type { AuthenticatedPrincipal, Lead, LeadActivity, LeadStage, Task, Vehicle, Appointment, JourneyEvent, AutomationRule, AutomationRun, AnalyticsSnapshot, Sale, InventoryChange, StockCost, StockCostChange } from "@vandlabs/contracts";
import { requireCapability, requireTenant, requireDealership, requireLocation } from "@vandlabs/contracts";
import * as demo from "@vandlabs/demo-data";
import * as runtime from "@vandlabs/demo-data/runtime";
import { getAutomationRules, runLeadAutomation } from "@vandlabs/demo-data/automation";
import { dataMode, publicScope, tenantConfig } from "./config";
import { databasePool, tenantTransaction, type SqlClient, type SqlPool } from "./postgres";
import { costInput, validateCostVersion, validateAcquisitionSale, type StockCostInput } from "./capital";
export { capitalReport } from "./capital";
export { dataMode, tenantConfig, publicScope } from "./config";
import { InputError, RecordNotFound, ConflictError, InventoryValidationError } from "./errors";
export { InputError, RecordNotFound, ConflictError, InventoryValidationError } from "./errors";
import { normalizeInventoryRows, type InventoryDraft } from "./inventory-input";
export { parseInventoryCsv, inventoryColumns } from "./inventory-input";
export interface Snapshot {
  leads: Lead[]; tasks: Task[]; vehicles: Vehicle[]; appointments: Appointment[];
  costs?: StockCost[]; costHistory?: StockCostChange[];
  inventoryDestinations?: {dealershipId:string;locationId:string;label:string}[];
  capabilities?: AuthenticatedPrincipal["capabilities"]; sales?: Sale[]; inventoryHistory?: InventoryChange[];
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
  return { leads: runtime.mergeRuntimeLeads(demo.leads), tasks: runtime.mergeRuntimeTasks(demo.tasks), vehicles: runtime.mergeRuntimeVehicles(demo.vehicles),
    costs:runtime.readRuntimeStockCosts(),costHistory:runtime.readRuntimeStockCostHistory(),appointments: runtime.mergeRuntimeAppointments(demo.appointments), sales: runtime.readRuntimeSales(), inventoryHistory: runtime.readRuntimeInventoryHistory(), activities: runtime.readRuntimeLeadActivities(), events: runtime.readRuntimeJourneyEvents(),
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
      const financialRelated=async <T>(table:string)=>p.capabilities.includes("capital:read")?payloads<T>((await c.query(`SELECT r.payload FROM ${table} r JOIN vehicles v ON v.id=r.vehicle_id AND v.tenant_id=r.tenant_id WHERE r.tenant_id=$1 AND v.dealership_id=ANY($2::uuid[]) AND v.location_id=ANY($3::uuid[])`,args)).rows):undefined;
      return {costs:await financialRelated<StockCost>("stock_costs"),costHistory:await financialRelated<StockCostChange>("stock_cost_history"), leads,vehicles,tasks:await related<Task>("tasks"),activities:await related<LeadActivity>("lead_activities"),appointments:await related<Appointment>("appointments"),
        runs:await related<AutomationRun>("automation_runs"),events:payloads<JourneyEvent>((await c.query("SELECT to_jsonb(e) || jsonb_build_object('tenantId',e.tenant_id,'sessionId',e.session_id,'vehicleId',e.vehicle_id,'type',e.event_type,'occurredAt',e.occurred_at) AS payload FROM journey_events e JOIN vehicles v ON v.id=e.vehicle_id AND v.tenant_id=e.tenant_id WHERE e.tenant_id=$1 AND v.dealership_id=ANY($2::uuid[]) AND v.location_id=ANY($3::uuid[])",args)).rows),
        sales:await related<Sale>("sales"),
        inventoryHistory:payloads<InventoryChange>((await c.query("SELECT h.payload FROM inventory_history h JOIN vehicles v ON v.id=h.vehicle_id AND v.tenant_id=h.tenant_id WHERE h.tenant_id=$1 AND v.dealership_id=ANY($2::uuid[]) AND v.location_id=ANY($3::uuid[])",args)).rows),
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
      const lead=await lockedLead(c,p,id,"lead:write");
      if(patch.stage && patch.stage!=="won" && (await c.query("SELECT id FROM sales WHERE tenant_id=$1 AND lead_id=$2",[p.tenantId,id])).rows.length)throw new ConflictError("Confirmed sale requires an approved reversal.");
  const updated={...lead,...patch,updatedAt:new Date().toISOString()};
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
    scheduleAppointment(p:AuthenticatedPrincipal,id:string,input:AppointmentInput) { return tx(p.tenantId,async c=> {
      validateAppointment(input);const lead=await lockedLead(c,p,id,"lead:write");requireCapability(p,"task:write");
      if(!lead.locationId)throw new InputError("Lead has no location.");
      if(lead.vehicleId) { const v=(await c.query("SELECT * FROM vehicles WHERE id=$1 AND tenant_id=$2 FOR SHARE",[lead.vehicleId,p.tenantId])).rows[0];if(!v || !["available","reserved"].includes(String(v.availability_status)))throw new InputError("Vehicle unavailable."); }
      const item:Appointment={...input,id:randomUUID(),leadId:id,vehicleId:lead.vehicleId,locationId:lead.locationId,status:"scheduled"};
      await c.query("INSERT INTO appointments(id,tenant_id,lead_id,payload) VALUES($1,$2,$3,$4)",[item.id,p.tenantId,id,item]);
      const record=operationActivity(p,id,"appointment_scheduled","Staff confirmed a visit or test drive.");await activity(c,record);
      const task:Task={id:randomUUID(),tenantId:p.tenantId,leadId:id,title:"Appointment reminder",owner:lead.assignedTo||p.userId,dueAt:new Date(Math.max(Date.now(),Date.parse(input.scheduledAt)-3600000)).toISOString(),completed:false,priority:"normal",origin:"human"};await saveTask(c,task);
      return {data:item};
    }); },
    setAppointmentStatus(p:AuthenticatedPrincipal,id:string,status:Appointment["status"]) {return tx(p.tenantId,async c=> {
      validateAppointmentStatus(status);requireCapability(p,"lead:write");
      const row=(await c.query("SELECT payload FROM appointments WHERE id=$1 AND tenant_id=$2 FOR UPDATE",[id,p.tenantId])).rows[0];if(!row)throw new RecordNotFound();
      const item=row.payload as Appointment;await lockedLead(c,p,item.leadId,"lead:write");
      const updated={...item,status};await c.query("UPDATE appointments SET payload=$1 WHERE id=$2 AND tenant_id=$3",[updated,id,p.tenantId]);
      await activity(c,operationActivity(p,item.leadId,"appointment_updated",`Appointment marked ${status}.`));return {data:updated};
    });},
    confirmSale(p:AuthenticatedPrincipal,id:string,input:SaleInput) {return tx(p.tenantId,async c=> {
      validateSale(input);const lead=await lockedLead(c,p,id,"lead:write");requireCapability(p,"inventory:write");
      if(!lead.vehicleId)throw new InputError("Vehicle required.");
      const existing=(await c.query("SELECT payload FROM sales WHERE tenant_id=$1 AND lead_id=$2",[p.tenantId,id])).rows[0];if(existing)return sameSale(existing.payload as Sale,input);
      const row=(await c.query("SELECT * FROM vehicles WHERE id=$1 AND tenant_id=$2 FOR UPDATE",[lead.vehicleId,p.tenantId])).rows[0];if(!row)throw new RecordNotFound();const vehicle=decodeVehicle(row);inventoryScope(p,vehicle);
      if(!["available","reserved"].includes(vehicle.availabilityStatus))throw new ConflictError("Vehicle already sold or archived.");
      const knownCost=(await c.query("SELECT payload FROM stock_costs WHERE tenant_id=$1 AND vehicle_id=$2",[p.tenantId,vehicle.id])).rows[0]?.payload as StockCost|undefined;if(knownCost)validateAcquisitionSale(knownCost,input);
      const sale=makeSale(p,lead,input);const updated={...vehicle,availabilityStatus:"sold" as const,publishStatus:"archived" as const,updatedAt:sale.confirmedAt};
      await c.query("INSERT INTO sales(id,tenant_id,lead_id,vehicle_id,payload,amount,sold_at) VALUES($1,$2,$3,$4,$5,$6,$7)",[sale.id,p.tenantId,id,vehicle.id,sale,sale.amount,sale.soldAt]);
      await c.query("UPDATE vehicles SET payload=$1,availability_status='sold',publish_status='archived',updated_at=$2 WHERE id=$3 AND tenant_id=$4",[updated,sale.confirmedAt,vehicle.id,p.tenantId]);
      const won={...lead,stage:"won" as const,updatedAt:sale.confirmedAt};await c.query("UPDATE leads SET payload=$1,stage='won',updated_at=$2 WHERE id=$3 AND tenant_id=$4",[won,sale.confirmedAt,id,p.tenantId]);
      await c.query(`UPDATE tasks SET completed=true,payload=payload || '{"completed":true}'::jsonb WHERE tenant_id=$1 AND lead_id=$2 AND NOT completed`,[p.tenantId,id]);
      await activity(c,operationActivity(p,id,"sale_confirmed","Manager confirmed recorded sale; inventory withdrawn."));
      const change=inventoryChange(p,vehicle,updated);await c.query("INSERT INTO inventory_history(id,tenant_id,vehicle_id,payload,occurred_at) VALUES($1,$2,$3,$4,$5)",[change.id,p.tenantId,vehicle.id,change,change.occurredAt]);return {data:sale};
    });},
    saveStockCost(p:AuthenticatedPrincipal,id:string,input:unknown,expectedVersion:unknown) {return tx(p.tenantId,async c=> {
      requireCapability(p,"capital:write");const values=costInput(input);validateCostVersion(expectedVersion);
      const row=(await c.query("SELECT * FROM vehicles WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[p.tenantId,id])).rows[0];if(!row)throw new RecordNotFound();
      const vehicle=decodeVehicle(row);financialScope(p,vehicle);
      const existing=(await c.query("SELECT payload FROM stock_costs WHERE tenant_id=$1 AND vehicle_id=$2",[p.tenantId,id])).rows[0]?.payload as StockCost|undefined;
      if((existing?.version??0)!==expectedVersion)throw new ConflictError("Cost record changed. Refresh before saving.");
      const sale=(await c.query("SELECT payload FROM sales WHERE tenant_id=$1 AND vehicle_id=$2",[p.tenantId,id])).rows[0]?.payload as Sale|undefined;validateAcquisitionSale(values,sale);
      const record=stockCost(p,id,values,expectedVersion+1),change=stockCostChange(p,id,existing,record);
      await c.query("INSERT INTO stock_costs(tenant_id,vehicle_id,version,payload) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,vehicle_id) DO UPDATE SET version=EXCLUDED.version,payload=EXCLUDED.payload",[p.tenantId,id,record.version,record]);
      await c.query("INSERT INTO stock_cost_history(id,tenant_id,vehicle_id,payload) VALUES($1,$2,$3,$4)",[change.id,p.tenantId,id,change]);return record;
    });},
    updateVehicleDetails(p:AuthenticatedPrincipal,id:string,input:unknown) {return tx(p.tenantId,async c=> {
      requireCapability(p,"inventory:write");const draft=normalizeInventoryRows([input])[0];
      const row=(await c.query("SELECT * FROM vehicles WHERE id=$1 AND tenant_id=$2 FOR UPDATE",[id,p.tenantId])).rows[0];if(!row)throw new RecordNotFound();
      const vehicle=decodeVehicle(row);inventoryScope(p,vehicle);const updated=editedVehicle(vehicle,draft);
      await c.query("UPDATE vehicles SET payload=$1,updated_at=$2 WHERE id=$3 AND tenant_id=$4",[updated,updated.updatedAt,id,p.tenantId]);
      const change=detailHistory(p,vehicle,updated);await c.query("INSERT INTO inventory_history(id,tenant_id,vehicle_id,payload,occurred_at) VALUES($1,$2,$3,$4,$5)",[change.id,p.tenantId,id,change,change.occurredAt]);return updated;
    });},
    async createInventoryBatch(p:AuthenticatedPrincipal,dealershipId:string,locationId:string,input:unknown,options:InventoryBatchOptions={}) {
      inventoryDestination(p,dealershipId,locationId);
      const drafts=normalizeInventoryRows(input,options.csv);
      try {return await tx(p.tenantId,async c=> {
        // Serialize identity checks and inserts for the tenant, including different dealers.
        await c.query("SELECT id FROM organizations WHERE tenant_id=$1 FOR UPDATE",[p.tenantId]);
        if(!(await c.query("SELECT id FROM locations WHERE tenant_id=$1 AND dealership_id=$2 AND id=$3",[p.tenantId,dealershipId,locationId])).rows.length)throw new InputError("Unknown destination.");
        const existing=(await c.query("SELECT stock_id FROM vehicles WHERE tenant_id=$1",[p.tenantId])).rows;
        rejectExistingStock(drafts,existing.map(v=>String(v.stock_id)),options.csv);
        const batchId=randomUUID();const vehicles=drafts.map(d=>draftVehicle(p,dealershipId,locationId,d));
        if(!options.preview)for(const vehicle of vehicles) {
          await c.query("INSERT INTO vehicles(id,tenant_id,dealership_id,location_id,slug,stock_id,payload,publish_status,availability_status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,'draft','available',$8,$8)",[vehicle.id,p.tenantId,dealershipId,locationId,vehicle.slug,vehicle.stockId,vehicle,vehicle.createdAt]);
          const change=creationHistory(p,vehicle,batchId);
          await c.query("INSERT INTO inventory_history(id,tenant_id,vehicle_id,payload,occurred_at) VALUES($1,$2,$3,$4,$5)",[change.id,p.tenantId,vehicle.id,change,change.occurredAt]);
        }
        return {batchId,preview:!!options.preview,vehicles};
      });}catch(e){if((e as {code?:string}).code==="23505")throw new ConflictError("Stock identity was added concurrently. Refresh the preview.");throw e;}
    },
    updateVehicle(p:AuthenticatedPrincipal,id:string,patch:Pick<Vehicle,"price"|"availabilityStatus"|"publishStatus">) { return tx(p.tenantId,async c=> {
      validateVehiclePatch(patch);requireCapability(p,"inventory:write");const row=(await c.query("SELECT * FROM vehicles WHERE id=$1 AND tenant_id=$2 FOR UPDATE",[id,p.tenantId])).rows[0];
      if (!row) throw new RecordNotFound();const vehicle=decodeVehicle(row);requireDealership(p,vehicle.dealershipId);requireLocation(p,vehicle.locationId);
      if(vehicle.availabilityStatus==="sold" && patch.availabilityStatus!=="sold" && (await c.query("SELECT id FROM sales WHERE tenant_id=$1 AND vehicle_id=$2",[p.tenantId,id])).rows.length)throw new ConflictError("Confirmed sale requires an approved reversal.");
      if(patch.publishStatus==="published"&&(!vehicle.media.length||patch.price<=0))throw new InputError("Publication requires imagery and a positive asking price.");
      const updated={...vehicle,price:patch.price,availabilityStatus:patch.availabilityStatus,publishStatus:patch.publishStatus,updatedAt:new Date().toISOString()};
      await c.query("UPDATE vehicles SET payload=$1,availability_status=$2,publish_status=$3,updated_at=$4 WHERE id=$5 AND tenant_id=$6",[updated,updated.availabilityStatus,updated.publishStatus,updated.updatedAt,id,p.tenantId]);
      const change=inventoryChange(p,vehicle,updated);
      await c.query("INSERT INTO inventory_history(id,tenant_id,vehicle_id,payload,occurred_at) VALUES($1,$2,$3,$4,$5)",[change.id,change.tenantId,id,change,change.occurredAt]);return updated;
    }); },
  };
}
async function productionStore() { return postgresStore(await databasePool()); }
export async function publicInventory() {
  const s=publicScope(); return dataMode()==="aurora"?(await productionStore()).inventory(s.tenantId,s.dealershipId):runtime.mergeRuntimeVehicles(demo.vehicles).filter(v=>v.publishStatus==="published");
}
export async function staffSnapshot(p:AuthenticatedPrincipal):Promise<Snapshot> {
  if (dataMode()==="aurora") return (await productionStore()).snapshot(p);
  for(const cap of ["lead:read","inventory:read","analytics:read"] as const) requireCapability(p,cap);
  const s=demoSnapshot();s.leads=s.leads.filter(l=>visible(p,l));s.vehicles=s.vehicles.filter(v=>visible(p,v));
  const ids=new Set(s.leads.map(l=>l.id));s.tasks=s.tasks.filter(t=>ids.has(t.leadId));s.activities=s.activities.filter(a=>ids.has(a.leadId));s.appointments=s.appointments.filter(a=>ids.has(a.leadId));s.runs=s.runs.filter(r=>ids.has(r.leadId));const vehicleIds=new Set(s.vehicles.map(v=>v.id));s.sales=s.sales?.filter(r=>ids.has(r.leadId));s.inventoryHistory=s.inventoryHistory?.filter(r=>s.vehicles.some(v=>v.id===r.vehicleId));s.events=s.events.filter(e=>!!e.vehicleId&&vehicleIds.has(e.vehicleId));s.costs=p.capabilities.includes("capital:read")?s.costs?.filter(c=>vehicleIds.has(c.vehicleId)):undefined;s.costHistory=p.capabilities.includes("capital:read")?s.costHistory?.filter(c=>vehicleIds.has(c.vehicleId)):undefined;return s;
}
export async function createLead(input:Omit<Lead,"id"|"stage"|"createdAt"|"updatedAt">) {
  const s=publicScope();if(input.tenantId!==s.tenantId||input.dealershipId!==s.dealershipId) throw new InputError("Invalid dealership.");
  if(dataMode()==="aurora")return(await productionStore()).createLead(input);
  const now=new Date().toISOString();const lead:Lead={...input,id:randomUUID(),stage:"new",createdAt:now,updatedAt:now};
  runtime.demoTransaction(state=> {
    if(input.vehicleId){const vehicle=(state["vehicles.json"] as Vehicle[]).find(v=>v.id===input.vehicleId)??demo.vehicles.find(v=>v.id===input.vehicleId);if(!vehicle||vehicle.tenantId!==input.tenantId||vehicle.dealershipId!==input.dealershipId||vehicle.locationId!==input.locationId||vehicle.availabilityStatus!=="available"||vehicle.publishStatus!=="published")throw new InputError("Vehicle unavailable.");}
    state["leads.json"]=[lead,...state["leads.json"]];
  });return{lead,automation:runLeadAutomation(lead,"lead_created")};
}
export async function patchLead(p:AuthenticatedPrincipal,id:string,patch:Partial<Pick<Lead,"stage"|"assignedTo"|"notes">>) {
  if(dataMode()==="aurora")return(await productionStore()).patchLead(p,id,patch);
  const lead=demoSnapshot().leads.find(l=>l.id===id);if(!lead)throw new RecordNotFound();scope(p,lead,"lead:write");
  if(patch.stage && patch.stage!=="won" && runtime.readRuntimeSales().some(s=>s.leadId===id))throw new ConflictError("Confirmed sale requires an approved reversal.");
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
  validateVehiclePatch(patch);
  if(dataMode()==="aurora")return(await productionStore()).updateVehicle(p,id,patch);
  return runtime.demoTransaction(state=> {
    const current=state["vehicles.json"] as Vehicle[];
    const vehicle=current.find(v=>v.id===id)??demo.vehicles.find(v=>v.id===id);
    if(!vehicle)throw new RecordNotFound(); inventoryScope(p,vehicle);
    if(vehicle.availabilityStatus==="sold" && patch.availabilityStatus!=="sold" && (state["sales.json"] as Sale[]).some(s=>s.vehicleId===id))throw new ConflictError("Confirmed sale requires an approved reversal.");
    if(patch.publishStatus==="published"&&(!vehicle.media.length||patch.price<=0))throw new InputError("Publication requires imagery and a positive asking price.");
    const updated={...vehicle,...patch,updatedAt:new Date().toISOString()};
    state["vehicles.json"]=[updated,...current.filter(v=>v.id!==id)];
    state["inventory-history.json"]=[inventoryChange(p,vehicle,updated),...state["inventory-history.json"]];
    return updated;
  });
}
export function metrics(s:Snapshot):AnalyticsSnapshot {
  const stages:AnalyticsSnapshot["stageCounts"]={};const sources:Record<string,number>={};
  for(const l of s.leads){stages[l.stage]=(stages[l.stage]||0)+1;sources[l.source]=(sources[l.source]||0)+1;}
  return {inventory:s.vehicles.length,available:s.vehicles.filter(v=>v.availabilityStatus==="available").length,reserved:s.vehicles.filter(v=>v.availabilityStatus==="reserved").length,sold:s.vehicles.filter(v=>v.availabilityStatus==="sold").length,leads:s.leads.length,uncontacted:stages.new||0,qualified:stages.qualified||0,appointments:s.appointments.filter(a=>a.status==="scheduled").length,testDrives:stages.test_drive||0,negotiations:stages.negotiation||0,wins:stages.won||0,stageCounts:stages,sourceCounts:sources,vehicleDemand:s.vehicles.map(v=>({vehicleId:v.id,views:s.events.filter(e=>e.vehicleId===v.id&&e.type==="vehicle_view").length,enquiries:s.leads.filter(l=>l.vehicleId===v.id).length}))};
}

export type AppointmentInput = Pick<Appointment,"type"|"scheduledAt">;
export type SaleInput = Pick<Sale,"amount"|"soldAt">;
function validateAppointment(input:AppointmentInput) {
  if(!["appointment","test_drive"].includes(input.type)||!Number.isFinite(Date.parse(input.scheduledAt))||Date.parse(input.scheduledAt)<=Date.now())throw new InputError("Choose a future appointment.");
}
function validateAppointmentStatus(status:Appointment["status"]) {
  if(!["scheduled","completed","cancelled","no_show"].includes(status))throw new InputError();
}
function validateSale(input:SaleInput) {
  if(!Number.isFinite(input.amount)||input.amount<=0||input.amount>999999999999||Math.abs(input.amount*100-Math.round(input.amount*100))>0.001||!Number.isFinite(Date.parse(input.soldAt))||Date.parse(input.soldAt)>Date.now())throw new InputError("Enter a recorded price and sale date.");
}
function validateVehiclePatch(patch:Pick<Vehicle,"price"|"availabilityStatus"|"publishStatus">) {
  if(!Number.isFinite(patch.price)||patch.price<0||patch.price>999999999999||!["available","reserved","sold"].includes(patch.availabilityStatus)||!["draft","published","archived"].includes(patch.publishStatus))throw new InputError();
}
function inventoryScope(p:AuthenticatedPrincipal,v:Vehicle) {
  requireCapability(p,"inventory:write");requireTenant(p,v.tenantId);requireDealership(p,v.dealershipId);requireLocation(p,v.locationId);
}
function operationActivity(p:AuthenticatedPrincipal,leadId:string,type:LeadActivity["type"],description:string):LeadActivity {
  return {id:randomUUID(),tenantId:p.tenantId,leadId,type,actor:p.userId,description,occurredAt:new Date().toISOString()};
}
function inventoryChange(p:AuthenticatedPrincipal,before:Vehicle,after:Vehicle):InventoryChange {
  const fields=(v:Vehicle)=>({price:v.price,availabilityStatus:v.availabilityStatus,publishStatus:v.publishStatus});
  return {id:randomUUID(),tenantId:p.tenantId,vehicleId:before.id,actor:p.userId,occurredAt:after.updatedAt,before:fields(before),after:fields(after)};
}
function makeSale(p:AuthenticatedPrincipal,lead:Lead,input:SaleInput):Sale {
  return {id:randomUUID(),tenantId:p.tenantId,leadId:lead.id,vehicleId:lead.vehicleId!,amount:input.amount,soldAt:new Date(input.soldAt).toISOString(),currency:"INR",confirmedBy:p.userId,confirmedAt:new Date().toISOString()};
}
function sameSale(sale:Sale,input:SaleInput) {
  if(sale.amount!==input.amount||Date.parse(sale.soldAt)!==Date.parse(input.soldAt))throw new ConflictError("Sale already confirmed with different details.");
  return {data:sale};
}
export async function scheduleAppointment(p:AuthenticatedPrincipal,id:string,input:AppointmentInput) {
  if(dataMode()==="aurora")return(await productionStore()).scheduleAppointment(p,id,input);
  validateAppointment(input);
  return runtime.demoTransaction(state=> {
    const lead=(state["leads.json"] as Lead[]).find(l=>l.id===id)??demo.leads.find(l=>l.id===id);if(!lead)throw new RecordNotFound();scope(p,lead,"lead:write");requireCapability(p,"task:write");
    if(!lead.locationId)throw new InputError("Lead has no location.");
    const vehicle=(state["vehicles.json"] as Vehicle[]).find(v=>v.id===lead.vehicleId)??demo.vehicles.find(v=>v.id===lead.vehicleId);
    if(lead.vehicleId&&(!vehicle||!["available","reserved"].includes(vehicle.availabilityStatus)))throw new InputError("Vehicle unavailable.");
    const item:Appointment={...input,id:randomUUID(),leadId:id,vehicleId:lead.vehicleId,locationId:lead.locationId,status:"scheduled"};
    state["appointments.json"]=[item,...state["appointments.json"]];
    state["lead-activity.json"]=[operationActivity(p,id,"appointment_scheduled","Staff confirmed a visit or test drive."),...state["lead-activity.json"]];
    const task:Task={id:randomUUID(),tenantId:p.tenantId,leadId:id,title:"Appointment reminder",owner:lead.assignedTo||p.userId,dueAt:new Date(Math.max(Date.now(),Date.parse(input.scheduledAt)-3600000)).toISOString(),completed:false,priority:"normal",origin:"human"};
    state["tasks.json"]=[task,...state["tasks.json"]];return {data:item};
  });
}
export async function setAppointmentStatus(p:AuthenticatedPrincipal,id:string,status:Appointment["status"]) {
  if(dataMode()==="aurora")return(await productionStore()).setAppointmentStatus(p,id,status);
  validateAppointmentStatus(status);
  return runtime.demoTransaction(state=> {
    const appointments=state["appointments.json"] as Appointment[];
    const item=appointments.find(a=>a.id===id)??demo.appointments.find(a=>a.id===id);if(!item)throw new RecordNotFound();
    const lead=(state["leads.json"] as Lead[]).find(l=>l.id===item.leadId)??demo.leads.find(l=>l.id===item.leadId);if(!lead)throw new RecordNotFound();scope(p,lead,"lead:write");
    const updated={...item,status};state["appointments.json"]=[updated,...appointments.filter(a=>a.id!==id)];
    state["lead-activity.json"]=[operationActivity(p,lead.id,"appointment_updated",`Appointment marked ${status}.`),...state["lead-activity.json"]];return {data:updated};
  });
}
export async function confirmSale(p:AuthenticatedPrincipal,id:string,input:SaleInput) {
  if(dataMode()==="aurora")return(await productionStore()).confirmSale(p,id,input);
  validateSale(input);
  return runtime.demoTransaction(state=> {
    const leads=state["leads.json"] as Lead[];
    const lead=leads.find(l=>l.id===id)??demo.leads.find(l=>l.id===id);if(!lead)throw new RecordNotFound();scope(p,lead,"lead:write");requireCapability(p,"inventory:write");
    const sales=state["sales.json"] as Sale[];const existing=sales.find(s=>s.leadId===id);if(existing)return sameSale(existing,input);
    if(!lead.vehicleId)throw new InputError("Vehicle required.");
    const vehicles=state["vehicles.json"] as Vehicle[];
    const vehicle=vehicles.find(v=>v.id===lead.vehicleId)??demo.vehicles.find(v=>v.id===lead.vehicleId);if(!vehicle)throw new RecordNotFound();inventoryScope(p,vehicle);
    if(!["available","reserved"].includes(vehicle.availabilityStatus)||sales.some(s=>s.vehicleId===vehicle.id))throw new ConflictError("Vehicle already sold or archived.");
    const knownCost=(state["stock-costs.json"] as StockCost[]).find(c=>c.vehicleId===vehicle.id&&c.tenantId===p.tenantId);if(knownCost)validateAcquisitionSale(knownCost,input);
    const sale=makeSale(p,lead,input);const updated={...vehicle,availabilityStatus:"sold" as const,publishStatus:"archived" as const,updatedAt:sale.confirmedAt};
    state["sales.json"]=[sale,...sales];state["vehicles.json"]=[updated,...vehicles.filter(v=>v.id!==vehicle.id)];
    state["leads.json"]=[{...lead,stage:"won",updatedAt:sale.confirmedAt},...leads.filter(l=>l.id!==id)];
    const tasks=runtimeTasks(state["tasks.json"] as Task[]);
    state["tasks.json"]=tasks.map(t=>t.leadId===id?{...t,completed:true}:t);
    state["lead-activity.json"]=[operationActivity(p,id,"sale_confirmed","Manager confirmed recorded sale; inventory withdrawn."),...state["lead-activity.json"]];
    state["inventory-history.json"]=[inventoryChange(p,vehicle,updated),...state["inventory-history.json"]];return {data:sale};
  });
}
function runtimeTasks(items:Task[]) {return [...items,...demo.tasks.filter(t=>!items.some(i=>i.id===t.id))];}
export { inventoryInsights, matchInventory } from "./intelligence";

export interface InventoryBatchOptions {csv?:boolean;preview?:boolean}
function inventoryDestination(p:AuthenticatedPrincipal,dealershipId:string,locationId:string) {
  requireCapability(p,"inventory:write");requireDealership(p,dealershipId);requireLocation(p,locationId);
}
function rejectExistingStock(drafts:InventoryDraft[],existing:string[],csv=false) {
  const ids=new Set(existing.map(s=>s.trim().toUpperCase()));
  const issues=drafts.flatMap((d,i)=>ids.has(d.stockId)?[{row:i+(csv?2:1),field:"stockId",message:"Stock identity already exists; use the existing inventory edit workflow."}]:[]);
  if(issues.length)throw new InventoryValidationError(issues);
}
function draftVehicle(p:AuthenticatedPrincipal,dealershipId:string,locationId:string,draft:InventoryDraft):Vehicle {
  const id=randomUUID(),now=new Date().toISOString();
  const prefix=`${draft.make}-${draft.model}-${draft.stockId}`.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
  return {...draft,id,slug:`${prefix}-${id}`,tenantId:p.tenantId,dealershipId,locationId,createdAt:now,updatedAt:now};
}
function creationHistory(p:AuthenticatedPrincipal,v:Vehicle,batchId:string):InventoryChange {
  return {...inventoryChange(p,v,v),action:"created",batchId,source:v.source,afterRecord:v};
}
export async function createInventoryBatch(p:AuthenticatedPrincipal,dealershipId:string,locationId:string,input:unknown,options:InventoryBatchOptions={}) {
  if(dataMode()==="aurora")return(await productionStore()).createInventoryBatch(p,dealershipId,locationId,input,options);
  inventoryDestination(p,dealershipId,locationId);
  if(p.tenantId!==tenantConfig.tenantId||!tenantConfig.organization.dealerships.some(d=>d.id===dealershipId&&d.locations.some(l=>l.id===locationId)))throw new InputError("Unknown destination.");
  const drafts=normalizeInventoryRows(input,options.csv);
  const prepare=(existing:Vehicle[])=> {
    rejectExistingStock(drafts,existing.filter(v=>v.tenantId===p.tenantId).map(v=>v.stockId),options.csv);
    return {batchId:randomUUID(),preview:!!options.preview,vehicles:drafts.map(d=>draftVehicle(p,dealershipId,locationId,d))};
  };
  if(options.preview)return prepare(runtime.mergeRuntimeVehicles(demo.vehicles));
  return runtime.demoTransaction(state=> {
    const current=state["vehicles.json"] as Vehicle[];
    const result=prepare([...current,...demo.vehicles.filter(v=>!current.some(c=>c.id===v.id))]);
    state["vehicles.json"]=[...result.vehicles,...current];
    state["inventory-history.json"]=[...result.vehicles.map(v=>creationHistory(p,v,result.batchId)),...state["inventory-history.json"]];
    return result;
  });
}

function editedVehicle(vehicle:Vehicle,draft:InventoryDraft):Vehicle {
  if(draft.stockId!==vehicle.stockId.toUpperCase())throw new InputError("Stock identity cannot be changed.");
  if(vehicle.availabilityStatus==="sold")throw new ConflictError("Sold vehicle details require an approved correction.");
  const media=[...draft.media,...vehicle.media.slice(1)];
  if(vehicle.publishStatus==="published"&&!media.length)throw new InputError("Published inventory requires imagery.");
  return {...vehicle,...draft,media,stockId:vehicle.stockId,source:vehicle.source,publishStatus:vehicle.publishStatus,availabilityStatus:vehicle.availabilityStatus,features:vehicle.features,specifications:vehicle.specifications,updatedAt:new Date().toISOString()};
}
function detailHistory(p:AuthenticatedPrincipal,before:Vehicle,after:Vehicle):InventoryChange {
  return {...inventoryChange(p,before,after),action:"updated",beforeRecord:before,afterRecord:after};
}
export async function updateVehicleDetails(p:AuthenticatedPrincipal,id:string,input:unknown) {
  if(dataMode()==="aurora")return(await productionStore()).updateVehicleDetails(p,id,input);
  requireCapability(p,"inventory:write");const draft=normalizeInventoryRows([input])[0];
  return runtime.demoTransaction(state=> {
    const current=state["vehicles.json"] as Vehicle[];
    const vehicle=current.find(v=>v.id===id)??demo.vehicles.find(v=>v.id===id);if(!vehicle)throw new RecordNotFound();inventoryScope(p,vehicle);
    const updated=editedVehicle(vehicle,draft);state["vehicles.json"]=[updated,...current.filter(v=>v.id!==id)];
    state["inventory-history.json"]=[detailHistory(p,vehicle,updated),...state["inventory-history.json"]];return updated;
  });
}

function financialScope(p:AuthenticatedPrincipal,v:Vehicle) {
  requireCapability(p,"capital:write");requireTenant(p,v.tenantId);requireDealership(p,v.dealershipId);requireLocation(p,v.locationId);
}
function stockCost(p:AuthenticatedPrincipal,vehicleId:string,input:StockCostInput,version:number):StockCost {
  return {...input,vehicleId,tenantId:p.tenantId,version,currency:"INR",recordedBy:p.userId,recordedAt:new Date().toISOString()};
}
function stockCostChange(p:AuthenticatedPrincipal,vehicleId:string,before:StockCost|undefined,after:StockCost):StockCostChange {
  return {id:randomUUID(),tenantId:p.tenantId,vehicleId,before:before??null,after};
}
export async function saveStockCost(p:AuthenticatedPrincipal,id:string,input:unknown,expectedVersion:unknown) {
  if(dataMode()==="aurora")return(await productionStore()).saveStockCost(p,id,input,expectedVersion);
  requireCapability(p,"capital:write");const values=costInput(input);validateCostVersion(expectedVersion);
  return runtime.demoTransaction(state=> {
    const vehicle=(state["vehicles.json"] as Vehicle[]).find(v=>v.id===id)??demo.vehicles.find(v=>v.id===id);if(!vehicle)throw new RecordNotFound();financialScope(p,vehicle);
    const costs=state["stock-costs.json"] as StockCost[],existing=costs.find(c=>c.vehicleId===id&&c.tenantId===p.tenantId);
    if((existing?.version??0)!==expectedVersion)throw new ConflictError("Cost record changed. Refresh before saving.");
    validateAcquisitionSale(values,(state["sales.json"] as Sale[]).find(s=>s.vehicleId===id));
    const record=stockCost(p,id,values,expectedVersion+1),change=stockCostChange(p,id,existing,record);
    state["stock-costs.json"]=[record,...costs.filter(c=>!(c.vehicleId===id&&c.tenantId===p.tenantId))];state["stock-cost-history.json"]=[change,...state["stock-cost-history.json"]];return record;
  });
}
