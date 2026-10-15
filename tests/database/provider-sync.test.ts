import { test } from "node:test";
import assert from "node:assert/strict";
import type { AuthenticatedPrincipal, CommerceState } from "../../packages/contracts/src/index";
import type { CommerceRepository } from "../../packages/data/src/commerce";
import { sourceCoverage } from "../../packages/data/src/commerce-rules";
import { providerSync, sourceSyncSummary } from "../../packages/data/src/provider-sync";

const start = new Date("2026-10-15T12:00:00Z"), expiry = "2026-12-01T00:00:00Z";
const owner: AuthenticatedPrincipal = {userId:"owner",tenantId:"tenant-a",dealershipIds:[],locationIds:[],capabilities:["commerce:manage"]};
const source = {id:"supplier",name:"Licensed supplier",kind:"licensed_api" as const,agreement:"Approved internal analytics contract",dealerUse:true,redistribute:false,enabled:true,expiresAt:expiry};
const vehicle = {sourceRecordId:"one",make:"Maruti",model:"Swift",year:2021,city:"Kochi",state:"Kerala",latitude:9.9,longitude:76.2,fuel:"petrol",transmission:"manual",odometerKm:40000,purchasePrice:400000,preparationCost:20000,transferFees:5000,resaleLow:null,resaleHigh:null,demandScore:null,mileageKmpl:null,evidence:"Licensed asking-price observation",observedAt:start.toISOString(),expiresAt:expiry,available:true};
const token = "private-provider-token";
const env = {VANDLABS_FEEDS_JSON:JSON.stringify(["tenant-a","tenant-b"].map(tenantId=>({tenantId,sourceId:source.id,url:"https://licensed.example.com/feed",tokenEnv:"VANDLABS_FEED_TOKEN_SUPPLIER"}))),VANDLABS_FEED_TOKENS_JSON:JSON.stringify({VANDLABS_FEED_TOKEN_SUPPLIER:token})};
const body = (vehicles: unknown[] = [vehicle]) => Response.json({vehicles});
function memory() {
  const states = new Map<string,CommerceState>();
  for(const id of ["tenant-a","tenant-b"])states.set(id,{subscription:null,sources:[{...source}],vehicles:[],fuel:[],keys:[],usage:{},audit:[]});
  const repository: CommerceRepository = {async transact(id,action) {const state=structuredClone(states.get(id)!);const result=action(state);states.set(id,state);return result;}};
  return {repository,states};
}
function deferred() {let resolve!:(response:Response)=>void;const promise=new Promise<Response>(r=>{resolve=r;});return {promise,resolve};}

test("licensed sync persists source-scoped success and history without storing tokens or endpoint URLs",async()=>{
  const {repository,states}=memory();let calls=0,now=start;
  const sync=providerSync(repository,{env,clock:()=>now,request:async(input,init)=>{calls++;assert.equal(String(input),"https://licensed.example.com/feed");assert.equal(init?.redirect,"error");assert.equal(new Headers(init?.headers).get("authorization"),`Bearer ${token}`);assert.ok(init?.signal);return body();}});
  assert.equal((await sync(owner,source.id)).received,1);now=new Date(start.getTime()+60000);await sync(owner,source.id);
  const state=states.get(owner.tenantId)!;
  assert.equal(calls,2);assert.equal(state.vehicles.length,1);assert.equal(state.syncHistory?.length,2);
  const summary=sourceSyncSummary(state,source.id,start)!;
  assert.equal(summary.status,"succeeded");assert.equal(summary.lastSucceededAt,now.toISOString());assert.equal(summary.canSync,false);
  assert.doesNotMatch(JSON.stringify(state),/private-provider-token|licensed\.example\.com/);
  assert.ok(!("runId" in summary));assert.equal(states.get("tenant-b")!.vehicles.length,0);
});

test("overlapping attempts for the same source are rejected but another tenant can sync independently",async()=>{
  const {repository,states}=memory(), pending=deferred();let calls=0;
  const sync=providerSync(repository,{env,clock:()=>start,request:async()=>{calls++;return calls===1?pending.promise:body();}});
  const first=sync(owner,source.id);await new Promise(r=>setImmediate(r));
  await assert.rejects(sync(owner,source.id),(e:{status:number})=>e.status===409);
  await sync({...owner,tenantId:"tenant-b"},source.id);
  pending.resolve(body());await first;
  assert.equal(calls,2);assert.equal(states.get("tenant-a")!.vehicles.length,1);assert.equal(states.get("tenant-b")!.vehicles.length,1);
});

test("failures persist sanitized status and exponential cooldown before another provider request",async()=>{
  const {repository,states}=memory();let now=start,calls=0;
  const sync=providerSync(repository,{env,clock:()=>now,request:async()=>{calls++;throw new Error(token);}});
  await assert.rejects(sync(owner,source.id),/synchronization failed/);
  assert.equal(states.get("tenant-a")!.sourceSync![0].nextAttemptAt,new Date(start.getTime()+60000).toISOString());
  await assert.rejects(sync(owner,source.id),(e:{status:number;retryAfter:number})=>e.status===429&&e.retryAfter===60);
  assert.equal(calls,1);now=new Date(start.getTime()+60000);await assert.rejects(sync(owner,source.id));
  const state=states.get("tenant-a")!;assert.equal(state.sourceSync![0].consecutiveFailures,2);
  assert.equal(state.sourceSync![0].nextAttemptAt,new Date(now.getTime()+120000).toISOString());
  assert.doesNotMatch(JSON.stringify(state),/private-provider-token/);assert.equal(state.sourceSync![0].error,"provider_unavailable");
});

test("provider Retry-After is bounded and success clears the failure cooldown",async()=>{
  const {repository,states}=memory();let now=start,calls=0;
  const sync=providerSync(repository,{env,clock:()=>now,request:async()=>++calls===1?new Response(token,{status:429,headers:{"retry-after":"99999999"}}):body()});
  await assert.rejects(sync(owner,source.id),(e:{retryAfter:number})=>e.retryAfter===3600);
  assert.equal(states.get("tenant-a")!.sourceSync![0].error,"provider_rate_limit");
  now=new Date(start.getTime()+3600000);await sync(owner,source.id);
  const run=states.get("tenant-a")!.sourceSync![0];assert.equal(run.consecutiveFailures,0);assert.equal(run.nextAttemptAt,new Date(now.getTime()+60000).toISOString());assert.equal(run.error,null);
});

test("invalid JSON, HTML and oversized provider bodies preserve the last committed records",async()=>{
  for(const response of [new Response("{broken",{headers:{"content-type":"application/json"}}),new Response("<html>private</html>",{headers:{"content-type":"text/html"}}),new Response("x".repeat(1000001),{headers:{"content-type":"application/json"}})]){
    const {repository,states}=memory();await providerSync(repository,{env,clock:()=>start,request:async()=>body()})(owner,source.id);
    const sync=providerSync(repository,{env,clock:()=>new Date(start.getTime()+60000),request:async()=>response});await assert.rejects(sync(owner,source.id));
    const state=states.get("tenant-a")!;assert.equal(state.vehicles[0].purchasePrice,400000);assert.equal(state.sourceSync![0].error,"invalid_payload");assert.equal(state.sourceSync![0].lastSucceededAt,start.toISOString());
  }
});

test("a late response from an expired lease cannot overwrite the replacement attempt",async()=>{
  const {repository,states}=memory(),pending=deferred();let now=start,calls=0;
  const sync=providerSync(repository,{env,clock:()=>now,request:async()=>++calls===1?pending.promise:body([{...vehicle,purchasePrice:450000,observedAt:now.toISOString()}])});
  const first=sync(owner,source.id);await new Promise(r=>setImmediate(r));
  now=new Date(start.getTime()+61000);await sync(owner,source.id);
  pending.resolve(body());await assert.rejects(first,(e:{status:number})=>e.status===409);
  const state=states.get("tenant-a")!;assert.equal(state.vehicles[0].purchasePrice,450000);assert.equal(state.sourceSync![0].status,"succeeded");
  assert.ok(state.syncHistory!.some(run=>run.error==="lease_expired"));
});

test("source permissions are rechecked after network I/O and before atomic commit",async()=>{
  const {repository,states}=memory(),pending=deferred();
  const sync=providerSync(repository,{env,clock:()=>start,request:async()=>pending.promise});
  const attempt=sync(owner,source.id);await new Promise(r=>setImmediate(r));states.get("tenant-a")!.sources[0].enabled=false;
  pending.resolve(body());await assert.rejects(attempt);
  const state=states.get("tenant-a")!;assert.equal(state.vehicles.length,0);assert.equal(state.sourceSync![0].error,"agreement");
});

test("unsafe endpoints, credential names and ambiguous configurations never send requests",async()=>{
  for(const patch of [{url:"http://licensed.example.com"},{url:"https://user:pass@licensed.example.com"},{url:"https://172.16.0.1/feed"},{url:"https://2130706433/feed"},{url:"https://[::1]/feed"},{url:"https://service.internal/feed"},{tokenEnv:"DATABASE_URL"}]){
    const {repository,states}=memory();let calls=0;
    const config={tenantId:owner.tenantId,sourceId:source.id,url:"https://licensed.example.com/feed",tokenEnv:"VANDLABS_FEED_TOKEN_SUPPLIER",...patch};
    const sync=providerSync(repository,{env:{...env,VANDLABS_FEEDS_JSON:JSON.stringify([config])},clock:()=>start,request:async()=>{calls++;return body();}});
    await assert.rejects(sync(owner,source.id));assert.equal(calls,0);assert.equal(states.get("tenant-a")!.sourceSync![0].error,"configuration");
  }
});

test("an unprivileged principal or a source from another tenant cannot cause a provider call",async()=>{
  const {repository,states}=memory();let calls=0;
  const sync=providerSync(repository,{env:{...env,VANDLABS_FEEDS_JSON:JSON.stringify([{tenantId:"tenant-b",sourceId:source.id,url:"https://licensed.example.com/feed",tokenEnv:"VANDLABS_FEED_TOKEN_SUPPLIER"}])},clock:()=>start,request:async()=>{calls++;return body();}});
  await assert.rejects(sync({...owner,capabilities:[]},source.id));assert.equal(states.get("tenant-a")!.sourceSync,undefined);
  await assert.rejects(sync(owner,source.id));assert.equal(calls,0);assert.equal(states.get("tenant-b")!.sourceSync,undefined);
});

test("older source observations cannot overwrite newer values, and a mixed batch rolls back",async()=>{
  const {repository,states}=memory();let now=start,calls=0;
  const sync=providerSync(repository,{env,clock:()=>now,request:async()=>++calls===1?body():body([{...vehicle,purchasePrice:1,observedAt:new Date(start.getTime()-1000).toISOString()},{...vehicle,sourceRecordId:"new"}])});
  await sync(owner,source.id);now=new Date(start.getTime()+60000);await assert.rejects(sync(owner,source.id));
  const state=states.get("tenant-a")!;assert.equal(state.vehicles.length,1);assert.equal(state.vehicles[0].purchasePrice,400000);assert.equal(state.sourceSync![0].error,"invalid_payload");
});


test("successful provider requests are paced and duplicate endpoint entries are rejected",async()=>{
  const {repository,states}=memory();let calls=0;
  const sync=providerSync(repository,{env,clock:()=>start,request:async()=>{calls++;return body();}});
  await sync(owner,source.id);await assert.rejects(sync(owner,source.id),(e:{status:number;retryAfter:number})=>e.status===429&&e.retryAfter===60);assert.equal(calls,1);
  const alternate=memory();const entries=JSON.parse(env.VANDLABS_FEEDS_JSON);
  await assert.rejects(providerSync(alternate.repository,{env:{...env,VANDLABS_FEEDS_JSON:JSON.stringify([entries[0],entries[0]])},clock:()=>start,request:async()=>{throw new Error("must not fetch");}})(owner,source.id));
  assert.equal(alternate.states.get("tenant-a")!.sourceSync![0].error,"configuration");
  assert.equal(sourceSyncSummary(states.get("tenant-a")!,source.id,new Date(start.getTime()+60000))!.canSync,true);
});


test("coverage distinguishes source observation age from sync success and excludes expired or withdrawn availability",async()=>{
  const {repository,states}=memory();
  await providerSync(repository,{env,clock:()=>start,request:async()=>body()})(owner,source.id);
  const state=states.get("tenant-a")!;
  const original=state.vehicles[0];
  state.vehicles.push({...original,id:"older",available:false,observedAt:"2025-01-01T00:00:00.000Z"},{...original,id:"expired",expiresAt:start.toISOString()},{...original,id:"other",sourceId:"other"});
  const coverage=sourceCoverage(state,source.id,start);
  assert.deepEqual(coverage,{records:3,available:1,expired:1,oldestObservationAt:"2025-01-01T00:00:00.000Z",latestObservationAt:start.toISOString()});
  assert.deepEqual(sourceCoverage(state,"missing",start),{records:0,available:0,expired:0,oldestObservationAt:null,latestObservationAt:null});
});
