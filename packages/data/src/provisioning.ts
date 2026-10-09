import {randomUUID} from "node:crypto";
import type {AutomationRule} from "@vandlabs/contracts";
import {productionTenantConfig} from "./tenant-input";
import type {SqlClient} from "./postgres";
import {ConflictError} from "./errors";
/** Migration/admin connection only: grants and runtime auth never call this helper. */
export async function provisionTenant(c:SqlClient,input:unknown) {
  const config=productionTenantConfig(input);
  await c.query("BEGIN");
  try{
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[config.tenantId]);
    if((await c.query("SELECT id FROM organizations WHERE tenant_id=$1 OR id=$2",[config.tenantId,config.organization.id])).rows.length)throw new ConflictError("Organization is already provisioned; do not overwrite its records.");
    await c.query("INSERT INTO organizations(id,tenant_id,name) VALUES($1,$2,$3)",[config.organization.id,config.tenantId,config.organization.name]);
    for(const d of config.organization.dealerships){await c.query("INSERT INTO dealerships(id,tenant_id,organization_id,name,brand_name) VALUES($1,$2,$3,$4,$5)",[d.id,config.tenantId,config.organization.id,d.name,d.brandName]);
      for(const l of d.locations)await c.query("INSERT INTO locations(id,tenant_id,dealership_id,name,city,state,phone) VALUES($1,$2,$3,$4,$5,$6,$7)",[l.id,config.tenantId,d.id,l.name,l.city,l.state,l.phone]);}
    const rules:AutomationRule[]=[
      {id:randomUUID(),tenantId:config.tenantId,name:"New lead first response",enabled:true,trigger:"lead_created",delayMinutes:15,taskTitle:"First response",ownerFallback:"Sales desk",priority:"high",channel:"internal_task",requiresWhatsappConsent:false},
      {id:randomUUID(),tenantId:config.tenantId,name:"Qualified lead follow-up",enabled:true,trigger:"stage_changed",stages:["qualified"],delayMinutes:120,taskTitle:"Qualified lead follow-up",ownerFallback:"Sales desk",priority:"normal",channel:"internal_task",requiresWhatsappConsent:false},
    ];
    for(const r of rules)await c.query("INSERT INTO automation_rules(id,tenant_id,payload) VALUES($1,$2,$3)",[r.id,config.tenantId,r]);
    await c.query("COMMIT");return config;
  }catch(error){await c.query("ROLLBACK").catch(()=>undefined);throw error;}
}
