import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { migrationPool } from "../../packages/data/src/postgres";
import { tenantConfig, vehicles, leads, tasks, appointments } from "../../packages/demo-data/src/index";
import { getAutomationRules } from "../../packages/demo-data/src/automation";
// Explicit reference seed only. Never import this dataset into a live dealership.
if(process.env.ALLOW_REFERENCE_SEED!=="true")throw new Error("Set ALLOW_REFERENCE_SEED=true for an empty staging database.");
if(!process.env.MIGRATION_DATABASE_URL)throw new Error("Migration connection is required.");
const mapping=new Map<string,string>();
function uuid(id:string){if(!mapping.has(id)){const hex=createHash("sha256").update("vandlabs-reference:"+id).digest("hex").slice(0,32);mapping.set(id,`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20)}`);}return mapping.get(id)!;}
const rules=getAutomationRules(tenantConfig.tenantId);
function register(value:unknown){if(Array.isArray(value)){value.forEach(register);return;}if(value&&typeof value==="object")for(const [key,item] of Object.entries(value)){if(typeof item==="string"&&(key==="id"||key.endsWith("Id")))uuid(item);register(item);}}
register([tenantConfig,vehicles,leads,tasks,appointments,rules]);
function remap(value:unknown):unknown{if(typeof value==="string")return mapping.get(value)||value;if(Array.isArray(value))return value.map(remap);if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,remap(v)]));return value;}
const config=remap(tenantConfig) as typeof tenantConfig;
const pool=migrationPool();const c=await pool.connect();
try{
 await c.query("BEGIN");
 if((await c.query("SELECT id FROM organizations LIMIT 1")).rows.length)throw new Error("Reference seed requires an empty database.");
 await c.query("INSERT INTO organizations(id,tenant_id,name) VALUES($1,$2,$3)",[config.organization.id,config.tenantId,config.organization.name]);
 for(const d of config.organization.dealerships){await c.query("INSERT INTO dealerships(id,tenant_id,organization_id,name,brand_name) VALUES($1,$2,$3,$4,$4)",[d.id,config.tenantId,config.organization.id,d.name]);
  for(const l of d.locations)await c.query("INSERT INTO locations(id,tenant_id,dealership_id,name,city,state,phone) VALUES($1,$2,$3,$4,$5,$6,$7)",[l.id,config.tenantId,d.id,l.name,l.city,l.state,l.phone]);}
 for(const v of remap(vehicles) as typeof vehicles)await c.query("INSERT INTO vehicles(id,tenant_id,dealership_id,location_id,slug,stock_id,payload,publish_status,availability_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",[v.id,v.tenantId,v.dealershipId,v.locationId,v.slug,v.stockId,v,v.publishStatus,v.availabilityStatus]);
 for(const l of remap(leads) as typeof leads)await c.query("INSERT INTO leads(id,tenant_id,dealership_id,location_id,vehicle_id,payload,stage,source,campaign,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",[l.id,l.tenantId,l.dealershipId,l.locationId,l.vehicleId,l,l.stage,l.source,l.campaign,l.createdAt,l.updatedAt]);
 for(const t of remap(tasks) as typeof tasks)await c.query("INSERT INTO tasks(id,tenant_id,lead_id,payload,due_at,completed) VALUES($1,$2,$3,$4,$5,$6)",[t.id,config.tenantId,t.leadId,t,t.dueAt,t.completed]);
 for(const a of remap(appointments) as typeof appointments)await c.query("INSERT INTO appointments(id,tenant_id,lead_id,payload) VALUES($1,$2,$3,$4)",[a.id,config.tenantId,a.leadId,a]);
 for(const r of remap(rules) as typeof rules)await c.query("INSERT INTO automation_rules(id,tenant_id,payload) VALUES($1,$2,$3)",[r.id,config.tenantId,r]);
 await c.query("COMMIT");await mkdir(".runtime",{recursive:true});await writeFile(".runtime/tenant-config.json",JSON.stringify(config,null,2));
 console.log("Staging reference seeded. Set TENANT_CONFIG_JSON from .runtime/tenant-config.json; provision Cognito subjects with these UUID scope identifiers.");
}catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();await pool.end();}
