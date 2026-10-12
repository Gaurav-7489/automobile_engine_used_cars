import {test} from "node:test";
import assert from "node:assert/strict";
import {databaseOptions} from "../../packages/data/src/postgres";
import {runtimeReadiness} from "../../packages/data/src/readiness";
import {createPrincipalResolver} from "../../packages/server-auth/src/index";
import {requestIdentity} from "../../apps/web/lib/public-request";
import {dispatchNotifications} from "../../packages/data/src/notifications";
test("Neon mode fails closed with demo authentication; Cloudflare pool is bounded with verified TLS",async()=>{
  const principal={userId:"staff",tenantId:"t",dealershipIds:["d"],locationIds:["l"],capabilities:[]};
  const resolve=createPrincipalResolver({demoPrincipal:principal,env:{DATA_MODE:"neon",AUTH_MODE:"demo"}});
  await assert.rejects(resolve(new Request("https://dealer.example")),/Production data/);
  const options=databaseOptions({HOSTING_PROVIDER:"cloudflare",DATABASE_URL:"postgresql://app:secret@db.neon.tech/app?sslmode=disable"});
  assert.equal(options.max,2);assert.deepEqual(options.ssl,{rejectUnauthorized:true,ca:undefined});
  assert.equal(runtimeReadiness("command",{DATA_MODE:"neon",AUTH_MODE:"oidc"}).ready,false);
  assert.equal(requestIdentity(new Request("https://dealer.example",{headers:{"cf-connecting-ip":"192.0.2.1","x-forwarded-for":"1.2.3.4"}}),{HOSTING_PROVIDER:"cloudflare"}),"192.0.2.1");
});
test("Resend failures persist a retry and avoid customer PII or provider secrets",async()=>{
  const statements:string[]=[];let captured="";
  const pool={async connect(){return {async query(sql:string){statements.push(sql);return {rows:sql.includes("pg_roles")?[{rolsuper:false,rolbypassrls:false}]:sql.includes("RETURNING")?[{id:"job",lead_id:"lead",attempts:1}]:[]};},release(){}};}};
  const result=await dispatchNotifications("11111111-1111-4111-a111-111111111111",{pool,env:{RESEND_API_KEY:"secret",NOTIFICATION_FROM:"app@example.com",NOTIFICATION_TO:"owner@example.com",APP_ORIGIN:"https://dealer.example"},fetcher:async(_url,init)=>{captured=String(init?.body);assert.equal(new Headers(init?.headers).get("Idempotency-Key"),"lead-job");return new Response("provider-secret",{status:429});}});
  assert.equal(result.sent,0);assert.equal(result.claimed,1);assert.ok(statements.some(sql=>sql.includes("delivery_failed")));assert.ok(!captured.includes("secret"));
});

test("Neon data mode uses the shared store and never silently falls back to local records",async()=>{
  const previous={DATA_MODE:process.env.DATA_MODE,TENANT_CONFIG_JSON:process.env.TENANT_CONFIG_JSON,DATABASE_URL:process.env.DATABASE_URL,DATABASE_SECRET_ARN:process.env.DATABASE_SECRET_ARN};
  const {publicInventory}=await import("../../packages/data/src/index");
  try {
    process.env.DATA_MODE="neon";process.env.TENANT_CONFIG_JSON="{}";delete process.env.DATABASE_URL;delete process.env.DATABASE_SECRET_ARN;
    await assert.rejects(publicInventory(),/Database connection is not configured/);
  } finally {for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
