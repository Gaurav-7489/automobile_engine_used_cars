import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
import {tenantConfig} from "../../packages/demo-data/src/index";
import {productionTenantConfig} from "../../packages/data/src/tenant-input";
import {provisionTenant} from "../../packages/data/src/provisioning";
import {ConflictError} from "../../packages/data/src/errors";
import type {SqlClient} from "../../packages/data/src/postgres";
function config() {
  const c=structuredClone(tenantConfig);c.tenantId=randomUUID();c.organization.id=randomUUID();
  c.organization.dealerships=c.organization.dealerships.map(d=>({...d,id:randomUUID(),organizationId:c.organization.id,locations:d.locations.map(l=>({...l,id:randomUUID()}))}));
  c.activeDealershipId=c.organization.dealerships[0].id;return c;
}
test("tenant provisioning validates scopes, atomically creates hierarchy/rules and rejects overwrite",async()=>{
  const db=new PGlite();await db.waitReady;
  try{
    for(const name of (await readdir("infra/database/migrations")).filter(n=>n.endsWith(".sql")).sort())await db.exec((await readFile(`infra/database/migrations/${name}`,"utf8")).replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;",""));
    const client:SqlClient={async query(sql,values){return {rows:(await db.query<Record<string,unknown>>(sql,values)).rows};},release(){}};
    const input=config();await provisionTenant(client,input);
    assert.equal((await db.query("SELECT id FROM organizations WHERE tenant_id=$1",[input.tenantId])).rows.length,1);
    assert.equal((await db.query("SELECT id FROM automation_rules WHERE tenant_id=$1",[input.tenantId])).rows.length,2);
    await assert.rejects(provisionTenant(client,input),ConflictError);
    const rejected=config();await assert.rejects(provisionTenant({...client,async query(sql,values){if(sql.startsWith("INSERT INTO automation_rules"))throw new Error("rules failed");return client.query(sql,values);}},rejected),/rules failed/);
    assert.equal((await db.query("SELECT id FROM organizations WHERE tenant_id=$1",[rejected.tenantId])).rows.length,0);
    assert.throws(()=>productionTenantConfig({...input,tenantId:"demo-tenant"}));
    assert.throws(()=>productionTenantConfig({...input,activeDealershipId:randomUUID()}));
    assert.throws(()=>productionTenantConfig({...input,navigation:[{label:"Unsafe",href:"//attacker.example"}]}));
    assert.throws(()=>productionTenantConfig({...input,seo:{...input.seo,canonicalBase:"javascript:alert(1)"}}));
  }finally{await db.close();}
});
