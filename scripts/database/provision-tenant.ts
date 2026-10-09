import {readFile} from "node:fs/promises";
import {migrationPool} from "../../packages/data/src/postgres";
import {provisionTenant} from "../../packages/data/src/provisioning";
const path=process.argv[2];
if(!path)throw new Error("Pass an approved tenant configuration JSON file: pnpm db:provision-tenant /path/to/tenant.json");
const config:unknown=JSON.parse(await readFile(path,"utf8"));
const pool=migrationPool();const c=await pool.connect();
try{await provisionTenant(c,config);console.log("Organization, dealerships, locations and internal follow-up rules provisioned. Configure matching app scopes before accepting enquiries.");}
finally{c.release();await pool.end();}
