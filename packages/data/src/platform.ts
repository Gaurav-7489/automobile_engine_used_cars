import { randomUUID } from "node:crypto";
import { requireCapability, AuthorizationError, staffRoles, staffPrincipal,
  type AuthenticatedPrincipal, type PlatformTenant, type PlatformAudit, type StaffMember, type StaffRole } from "@vandlabs/contracts";
import { tenantConfig, vehicles, leads, tasks } from "@vandlabs/demo-data";
import * as runtime from "@vandlabs/demo-data/runtime";
import { dataMode } from "./config";
import { databasePool, tenantTransaction, type SqlPool } from "./postgres";
import { InputError, RecordNotFound, ConflictError } from "./errors";

export function platformScopes(p: AuthenticatedPrincipal): string[] {
  requireCapability(p, "platform:admin");
  const scopes=[...new Set(p.platformTenantIds ?? [p.tenantId])];
  if(!scopes.length)throw new AuthorizationError();
  return scopes;
}
function platformScope(p: AuthenticatedPrincipal, tenantId: string) {
  if (!platformScopes(p).includes(tenantId)) throw new AuthorizationError();
}
function staffInput(tenantId: string, input: unknown): Pick<StaffMember,"tenantId"|"userId"|"displayName"|"role"|"dealershipIds"|"locationIds"|"enabled"> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new InputError();
  const b = input as Record<string,unknown>;
  const list = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.length <= 100 && v.every(x=>typeof x==="string"&&x.length>0&&x.length<150) && new Set(v).size===v.length;
  if (typeof b.userId!=="string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(b.userId) ||
      typeof b.displayName!=="string" || !b.displayName.trim() || b.displayName.length>120 ||
      typeof b.role!=="string" || !Object.hasOwn(staffRoles,b.role) ||
      !list(b.dealershipIds) || !list(b.locationIds) || typeof b.enabled!=="boolean") throw new InputError();
  return { tenantId, userId:b.userId, displayName:b.displayName.trim(), role:b.role as StaffRole,
    dealershipIds:b.dealershipIds,locationIds:b.locationIds,enabled:b.enabled };
}
function checkVersion(value: unknown, current: number) {
  if(typeof value!=="number"||!Number.isInteger(value)||value<0)throw new InputError();
  if(value!==current)throw new ConflictError("Staff permissions changed. Refresh before saving.");
}
function record(p: AuthenticatedPrincipal, input: ReturnType<typeof staffInput>, old: StaffMember | undefined, version: unknown) {
  checkVersion(version, old?.version ?? 0);
  if(input.userId===p.userId)throw new InputError("Use a separate administrator to change your own access.");
  return {...input,version:(old?.version??0)+1,updatedAt:new Date().toISOString(),updatedBy:p.userId};
}
function audit(p:AuthenticatedPrincipal,member:StaffMember):PlatformAudit {
  return {id:randomUUID(),tenantId:member.tenantId,actor:p.userId,action:member.enabled?"staff.grant":"staff.disable",
    subject:member.userId,occurredAt:member.updatedAt,details:{role:member.role,dealershipIds:member.dealershipIds,locationIds:member.locationIds,enabled:member.enabled,version:member.version}};
}
function validateDestinations(input:ReturnType<typeof staffInput>, dealerships:PlatformTenant["dealerships"]) {
  if(!input.dealershipIds.every(id=>dealerships.some(d=>d.id===id)) ||
    !input.locationIds.every(id=>dealerships.some(d=>input.dealershipIds.includes(d.id)&&d.locations.some(l=>l.id===id))))
    throw new InputError("Staff scope must belong to the selected organization and dealerships.");
}

export function postgresPlatformStore(pool:SqlPool) {
  async function hierarchy(c:Awaited<ReturnType<SqlPool["connect"]>>,tenantId:string) {
    const org=(await c.query("SELECT id,name FROM organizations WHERE tenant_id=$1 ORDER BY created_at LIMIT 1",[tenantId])).rows[0];
    if(!org)throw new RecordNotFound();
    const dealers=(await c.query("SELECT id,name FROM dealerships WHERE tenant_id=$1 AND organization_id=$2 ORDER BY name",[tenantId,org.id])).rows;
    const locations=(await c.query("SELECT id,dealership_id,name,city FROM locations WHERE tenant_id=$1 ORDER BY name",[tenantId])).rows;
    return {organizationId:String(org.id),organization:String(org.name),dealerships:dealers.map(d=>({id:String(d.id),name:String(d.name),locations:locations.filter(l=>l.dealership_id===d.id).map(l=>({id:String(l.id),name:String(l.name),city:String(l.city)}))}))};
  }
  return {
    async snapshot(p:AuthenticatedPrincipal):Promise<PlatformTenant[]> {
      const result:PlatformTenant[]=[];
      for(const tenantId of platformScopes(p)) result.push(await tenantTransaction(pool,tenantId,async c=>{
        const h=await hierarchy(c,tenantId);
        const stats=(await c.query(`SELECT
          (SELECT count(*) FROM vehicles WHERE tenant_id=$1) AS vehicles,
          (SELECT count(*) FROM vehicles WHERE tenant_id=$1 AND publish_status='published') AS published,
          (SELECT count(*) FROM leads WHERE tenant_id=$1) AS leads,
          (SELECT count(*) FROM tasks WHERE tenant_id=$1 AND NOT completed) AS tasks,
          (SELECT count(*) FROM sales WHERE tenant_id=$1) AS sales`,[tenantId])).rows[0];
        return {tenantId,...h,counts:{vehicles:Number(stats.vehicles),publishedVehicles:Number(stats.published),leads:Number(stats.leads),openTasks:Number(stats.tasks),sales:Number(stats.sales)},
          staff:(await c.query("SELECT payload FROM staff_members WHERE tenant_id=$1 ORDER BY user_id",[tenantId])).rows.map(r=>r.payload as StaffMember),
          audit:(await c.query("SELECT payload FROM platform_audit WHERE tenant_id=$1 ORDER BY occurred_at DESC LIMIT 100",[tenantId])).rows.map(r=>r.payload as PlatformAudit)};
      }));
      return result;
    },
    async saveStaff(p:AuthenticatedPrincipal,tenantId:string,input:unknown,expectedVersion:unknown) {
      platformScope(p,tenantId);const b=staffInput(tenantId,input);
      return tenantTransaction(pool,tenantId,async c=>{
        // Serialize both first grants and amendments for the same subject.
        await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[tenantId+":"+b.userId]);
        const h=await hierarchy(c,tenantId);validateDestinations(b,h.dealerships);
        const old=(await c.query("SELECT payload FROM staff_members WHERE tenant_id=$1 AND user_id=$2 FOR UPDATE",[tenantId,b.userId])).rows[0]?.payload as StaffMember|undefined;
        const member=record(p,b,old,expectedVersion),event=audit(p,member);
        await c.query("INSERT INTO staff_members(tenant_id,user_id,payload) VALUES($1,$2,$3) ON CONFLICT(tenant_id,user_id) DO UPDATE SET payload=EXCLUDED.payload",[tenantId,member.userId,member]);
        await c.query("INSERT INTO platform_audit(id,tenant_id,actor,action,subject,payload,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7)",[event.id,tenantId,event.actor,event.action,event.subject,event,event.occurredAt]);
        return member;
      });
    },
    async principal(sub:string,tenantId:string):Promise<AuthenticatedPrincipal|null> {
      return tenantTransaction(pool,tenantId,async c=>{
        const row=(await c.query("SELECT payload FROM staff_members WHERE tenant_id=$1 AND user_id=$2",[tenantId,sub])).rows[0];
        if(!row)return null;const m=row.payload as StaffMember;
        if(!m.enabled||!Object.hasOwn(staffRoles,m.role)||m.userId!==sub||m.tenantId!==tenantId)return null;
        return staffPrincipal(m);
      });
    },
  };
}
export async function platformSnapshot(p:AuthenticatedPrincipal):Promise<PlatformTenant[]> {
  if(dataMode()==="aurora")return postgresPlatformStore(await databasePool()).snapshot(p);
  if(!platformScopes(p).includes(tenantConfig.tenantId))return [];
  const v=runtime.mergeRuntimeVehicles(vehicles).filter(x=>x.tenantId===tenantConfig.tenantId);
  const l=runtime.mergeRuntimeLeads(leads).filter(x=>x.tenantId===tenantConfig.tenantId);
  return [{tenantId:tenantConfig.tenantId,organizationId:tenantConfig.organization.id,organization:tenantConfig.organization.name,
    dealerships:tenantConfig.organization.dealerships.map(d=>({id:d.id,name:d.name,locations:d.locations.map(x=>({id:x.id,name:x.name,city:x.city}))})),
    counts:{vehicles:v.length,publishedVehicles:v.filter(x=>x.publishStatus==="published").length,leads:l.length,openTasks:runtime.mergeRuntimeTasks(tasks).filter(t=>t.tenantId===tenantConfig.tenantId&&!t.completed).length,sales:runtime.readRuntimeSales().filter(s=>s.tenantId===tenantConfig.tenantId).length},
    staff:runtime.readPlatformRecords<StaffMember>("staff-members.json").filter(x=>x.tenantId===tenantConfig.tenantId),
    audit:runtime.readPlatformRecords<PlatformAudit>("platform-audit.json").filter(x=>x.tenantId===tenantConfig.tenantId).slice(0,100)}];
}
export async function saveStaffMember(p:AuthenticatedPrincipal,tenantId:string,input:unknown,expectedVersion:unknown) {
  if(dataMode()==="aurora")return postgresPlatformStore(await databasePool()).saveStaff(p,tenantId,input,expectedVersion);
  platformScope(p,tenantId);
  if(tenantId!==tenantConfig.tenantId)throw new RecordNotFound();
  const b=staffInput(tenantId,input);validateDestinations(b,tenantConfig.organization.dealerships);
  return runtime.demoTransaction(state=>{
    const rows=state["staff-members.json"] as StaffMember[];
    const member=record(p,b,rows.find(s=>s.tenantId===tenantId&&s.userId===b.userId),expectedVersion);
    state["staff-members.json"]=[member,...rows.filter(s=>!(s.tenantId===tenantId&&s.userId===b.userId))];
    state["platform-audit.json"]=[audit(p,member),...state["platform-audit.json"]];return member;
  });
}
/** Called only after Cognito verifies subject, issuer, client and expiry. */
export async function resolveDatabaseStaff(sub:string,tenantId:string) {
  if(dataMode()!=="aurora")throw new Error("Database staff registry requires shared PostgreSQL.");
  return postgresPlatformStore(await databasePool()).principal(sub,tenantId);
}
export async function staffDirectory(p:AuthenticatedPrincipal) {
  requireCapability(p,"lead:read");
  if(p.assignedLeadOnly)return [{id:p.userId,name:"You"}];
  const rows=dataMode()==="aurora"?await tenantTransaction(await databasePool(),p.tenantId,async c=>(await c.query("SELECT payload FROM staff_members WHERE tenant_id=$1",[p.tenantId])).rows.map(r=>r.payload as StaffMember)):
    runtime.readPlatformRecords<StaffMember>("staff-members.json");
  const result=rows.filter(m=>m.enabled&&m.tenantId===p.tenantId&&m.dealershipIds.some(id=>p.dealershipIds.includes(id))&&m.locationIds.some(id=>p.locationIds.includes(id))).map(m=>({id:m.userId,name:m.displayName}));
  return dataMode()==="demo"?[{id:"Maya",name:"Maya"},{id:"Kabir",name:"Kabir"},...result]:result;
}
