import {runtimeReadiness,type Surface} from "../../packages/data/src/readiness";
const surface=(process.argv[2]??"command") as Surface;
if(!["web","command","platform"].includes(surface))throw new Error("Choose web, command or platform.");
const readiness=runtimeReadiness(surface);
console.log(JSON.stringify(readiness,null,2));
if(process.argv.includes("--probe")&&readiness.ready){
  try{
    const {databasePool,tenantTransaction}=await import("../../packages/data/src/postgres");
    const {publicScope}=await import("../../packages/data/src/config");
    await tenantTransaction(await databasePool(),publicScope().tenantId,async c=>{
      if(!(await c.query("SELECT id FROM organizations WHERE tenant_id=$1",[publicScope().tenantId])).rows.length)throw new Error("Tenant not provisioned.");
      for(const table of ["vehicles","leads","tasks","sales","staff_members","platform_audit"])await c.query(`SELECT 1 FROM ${table} LIMIT 1`);
    });
    console.log("Database probe passed: verified TLS connection, non-bypass role and required tables.");process.exit(0);
  }catch{console.error("Database probe failed. Check private connectivity, migration 0005, application-role grants and tenant provisioning.");process.exit(1);}
}
process.exit(readiness.ready?0:1);
