import {test} from "node:test";
import assert from "node:assert/strict";
import gateway,{Admission} from "../../infra/cloudflare/src/gateway";
import {takeBucket,cleanMediaKey,surface} from "../../infra/cloudflare/src/admission-core";
function coordinatorObject() {
  const data=new Map<string,unknown>();let queue=Promise.resolve();
  const tx={async get(key:string){return structuredClone(data.get(key));},async put(key:string,value:unknown){data.set(key,structuredClone(value));},async setAlarm(){},async delete(key:string){data.delete(key);},async list({prefix}:{prefix:string}){return new Map([...data].filter(([key])=>key.startsWith(prefix)));}};
  const storage={...tx,transaction(action:(value:typeof tx)=>Promise<unknown>){const next=queue.then(()=>action(tx));queue=next.then(()=>undefined,()=>undefined);return next;}};
  return new Admission({storage} as never);
}
function coordinator() {
  const data=new Map<string,unknown>();let queue=Promise.resolve();
  const tx={async get(key:string){return structuredClone(data.get(key));},async put(key:string,value:unknown){data.set(key,structuredClone(value));},async setAlarm(){},async delete(key:string){data.delete(key);},async list({prefix}:{prefix:string}){return new Map([...data].filter(([key])=>key.startsWith(prefix)));}};
  const storage={...tx,transaction(action:(value:typeof tx)=>Promise<unknown>){const next=queue.then(()=>action(tx));queue=next.then(()=>undefined,()=>undefined);return next;}};
  const object=new Admission({storage} as never);
  return async(body:unknown)=>{const r=await object.fetch(new Request("https://internal",{method:"POST",body:JSON.stringify(body)}));return {status:r.status,...await r.json() as Record<string,unknown>};};
}
test("concurrent admission cannot exceed the global capacity, release frees exactly one slot",async()=>{
  const call=coordinator();const results=await Promise.all(Array.from({length:30},()=>call({op:"acquire",limit:24})));
  assert.equal(results.filter(x=>x.success).length,24);assert.equal(results.filter(x=>x.status===503).length,6);
  const first=results.find(x=>x.lease)!;await call({op:"release",lease:first.lease});
  assert.equal((await call({op:"acquire",limit:24})).success,true);
  assert.equal((await call({op:"acquire",limit:24})).status,503);
});
test("atomic rate limits survive concurrent requests and invalid policies fail closed",async()=>{
  const call=coordinator();const results=await Promise.all(Array.from({length:20},()=>call({op:"rate",scope:"leads",limit:12,windowMs:60000})));
  assert.equal(results.filter(x=>x.success).length,12);
  assert.equal((await call({op:"rate",scope:"leads",limit:-1,windowMs:60000})).status,400);
  const first=takeBucket(undefined,0,1000,1);assert.equal(takeBucket(first.bucket,10,1000,1).allowed,false);assert.equal(takeBucket(first.bucket,1000,1000,1).allowed,true);
});
test("routing uses path boundaries and public media excludes traversal and unsafe types",()=>{
  assert.equal(surface("/command/api/leads"),"COMMAND");assert.equal(surface("/commanding"),"WEB");assert.equal(surface("/platform"),"PLATFORM");
  assert.ok(cleanMediaKey("/11111111-1111-4111-a111-111111111111/22222222-2222-4222-a222-222222222222.webp"));
  for(const path of ["/../secret.webp","/tenant/file.svg","/%2e%2e/secret.avif","/tenant/file.webp?secret=x"])assert.equal(cleanMediaKey(path),null);
});

test("streamed gateway responses hand their lease back through waitUntil, so sequential traffic never exhausts capacity",async()=>{
  const objects=new Map<string,Admission>();
  const ADMISSION={idFromName:(name:string)=>name,get:(id:string)=>{if(!objects.has(id))objects.set(id,coordinatorObject());const object=objects.get(id)!;return {fetch:(_url:string,init:RequestInit)=>object.fetch(new Request("https://internal",init))};}};
  const page={fetch:async()=>new Response("<html>ok</html>",{status:200})};
  const env={WEB:page,COMMAND:page,PLATFORM:page,ADMISSION,VEHICLE_MEDIA:{},PUBLIC_ORIGIN:"https://gateway.example.dev"};
  for(let i=0;i<30;i++){
    const pending:Promise<unknown>[]=[];
    const response=await gateway.fetch(new Request("https://gateway.example.dev/inventory"),env as never,{waitUntil:(p:Promise<unknown>)=>pending.push(p)} as never);
    assert.equal(response.status,200,`request ${i}`);await response.text();
    assert.equal(pending.length,1,"release is registered with the runtime");await Promise.all(pending);
  }
});
