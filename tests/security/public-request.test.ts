import test from "node:test";
import assert from "node:assert/strict";
import { limitPublicRequest, publicJson, publicOriginFailure, requestIdentity } from "../../apps/web/lib/public-request";
import { parseDesktopRelease, releaseRepository } from "../../apps/web/lib/desktop-release";

test("public JSON is bounded, object-shaped, and protected from foreign browser origins", async () => {
  const request = (body: string) => new Request("https://dealer.example/api/leads", {method:"POST",headers:{"Content-Type":"application/json"},body});
  assert.deepEqual(await publicJson(request('{"name":"A"}')), { name: "A" });
  await assert.rejects(publicJson(request("[]")), SyntaxError);
  await assert.rejects(publicJson(request('{"note":"' + "x".repeat(200) + '"}'), 32), SyntaxError);
  await assert.rejects(publicJson(new Request("https://dealer.example", {method:"POST",body:"{}"})), SyntaxError);
  assert.equal(publicOriginFailure(new Request("https://dealer.example", {headers:{origin:"https://evil.example"}}))?.status,403);
  assert.equal(publicOriginFailure(new Request("https://dealer.example", {headers:{origin:"https://dealer.example"}})),null);
  assert.equal(publicOriginFailure(new Request("http://localhost:3000/api/leads", {headers:{host:"127.0.0.1:3000",origin:"http://127.0.0.1:3000","sec-fetch-site":"same-origin"}})),null);
  assert.equal(publicOriginFailure(new Request("http://localhost:3000/api/leads", {headers:{host:"127.0.0.1:3000",origin:"http://foreign.example","x-forwarded-host":"foreign.example"}}))?.status,403);
  assert.equal(requestIdentity(new Request("https://dealer.example", {headers:{"x-forwarded-for":"1.2.3.4"}}),{}),"shared-unknown-client");
});

test("local limiter blocks repeats and expires counters while production fails closed", async () => {
  const env = { DATA_MODE: "demo", RATE_LIMIT_TRUSTED_IP_HEADER: "x-test-client" };
  const request = new Request("https://dealer.example", {headers:{"x-test-client":"192.0.2.90"}});
  for (let n=0;n<2;n++) assert.equal(await limitPublicRequest(request,"regression",2,1000,{env,clock:()=>100}),null);
  assert.equal((await limitPublicRequest(request,"regression",2,1000,{env,clock:()=>100}))?.status,429);
  assert.equal(await limitPublicRequest(request,"regression",2,1000,{env,clock:()=>1100}),null);
  assert.equal((await limitPublicRequest(request,"regression",2,1000,{env:{DATA_MODE:"aurora"}}))?.status,503);
});

test("distributed limiter checks the atomic count and masks provider failures", async () => {
  const env = {DATA_MODE:"aurora",UPSTASH_REDIS_REST_URL:"https://redis.example",UPSTASH_REDIS_REST_TOKEN:"test-credential",RATE_LIMIT_TRUSTED_IP_HEADER:"x-test-client"};
  const request = new Request("https://dealer.example",{headers:{"x-test-client":"192.0.2.91"}});
  const fetcher:typeof fetch = async (_url,init) => {
    const command=JSON.parse(String(init?.body));assert.equal(command[0],"EVAL");assert.equal(command[2],"1");assert.equal(command[3].includes("192.0.2.91"),false);
    return Response.json({result:[3,900]});
  };
  const limited=await limitPublicRequest(request,"redis-test",2,1000,{env,fetcher});assert.equal(limited?.status,429);assert.equal(limited?.headers.get("Retry-After"),"1");
  const failed=await limitPublicRequest(request,"redis-test",2,1000,{env,fetcher:async()=>Response.json({error:"secret provider detail"})});assert.equal(failed?.status,503);assert.equal((await failed!.text()).includes("secret"),false);
});

test("desktop downloads require a complete published source-bound prerelease and fixed asset URLs", () => {
  const sha="a".repeat(40),tag="desktop-"+sha.slice(0,12);
  const input={draft:false,prerelease:true,tag_name:tag,target_commitish:sha,published_at:"2026-10-09T10:00:00Z",assets:["Automobile-Engine-Windows-x64.exe","Automobile-Engine-macOS-universal.dmg"].map(name=>({name,browser_download_url:`https://github.com/${releaseRepository}/releases/download/${tag}/${name}`,size:1000,state:"uploaded",digest:"sha256:"+"f".repeat(64)}))};
  assert.equal(parseDesktopRelease(input)?.assets.windows?.sha256,"f".repeat(64));
  assert.equal(parseDesktopRelease({...input,draft:true}),null);
  assert.equal(parseDesktopRelease({...input,target_commitish:"b".repeat(40)}),null);
  assert.equal(parseDesktopRelease({...input,assets:input.assets.slice(0,1)}),null);
  assert.equal(parseDesktopRelease({...input,assets:[{...input.assets[0],browser_download_url:"https://evil.example/installer.exe"},input.assets[1]]}),null);
});
