import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { seal,unseal,safeReturnTo,createOAuthHandlers } from "../../packages/server-auth/src/oauth";
test("session encryption rejects tampering and return paths reject external or auth targets",()=>{
 const secret=randomBytes(32).toString("base64");const value=seal({refresh:"secret"},secret);assert.deepEqual(unseal(value,secret),{refresh:"secret"});
 assert.throws(()=>unseal(value.slice(0,-4)+"AAAA",secret));
 for(const url of ["https://evil.example","//evil.example","/platform","/command/../platform","/command/auth/callback","/command\\evil"]){assert.equal(safeReturnTo(url,"/command"),"/command");}
 assert.equal(safeReturnTo("/command/leads?stage=new","/command"),"/command/leads?stage=new");
});
test("Cognito login uses PKCE, encrypted state, exact callback and secure cookies",async()=>{
 const before={...process.env};try{
  process.env.APP_ORIGIN="https://dealer.example";process.env.COGNITO_DOMAIN="https://auth.example";process.env.COGNITO_CLIENT_ID="web-client";process.env.SESSION_SECRET=randomBytes(32).toString("base64");
  const handlers=createOAuthHandlers("/command",async()=>({}));const response=await handlers.login(new Request("https://dealer.example/command/auth/login?returnTo=https://evil.example"));
  assert.equal(response.status,303);const redirect=new URL(response.headers.get("location")!);
  assert.equal(redirect.searchParams.get("code_challenge_method"),"S256");assert.equal(redirect.searchParams.get("redirect_uri"),"https://dealer.example/command/auth/callback");
  const cookie=response.headers.get("set-cookie")!;assert.match(cookie,/Secure; SameSite=Lax/);assert.match(cookie,/HttpOnly/);
  const rejected=await handlers.callback(new Request("https://dealer.example/command/auth/callback?state=forged&code=bad",{headers:{cookie:cookie.split(";")[0]}}));assert.equal(rejected.status,401);
  const logout=await handlers.logout(new Request("https://dealer.example/command/auth/logout",{method:"POST",headers:{origin:"https://evil.example"}}));assert.equal(logout.status,401);
 }finally{for(const key of ["APP_ORIGIN","COGNITO_DOMAIN","COGNITO_CLIENT_ID","SESSION_SECRET"])if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}
});

test("callback and refresh verify access before issuing cookies, and logout revokes the stored refresh token", async () => {
 const keys=["APP_ORIGIN","COGNITO_DOMAIN","COGNITO_CLIENT_ID","SESSION_SECRET"];
 const before={...process.env};const originalFetch=globalThis.fetch;
 try {
  process.env.APP_ORIGIN="https://dealer.example";process.env.COGNITO_DOMAIN="https://auth.example";process.env.COGNITO_CLIENT_ID="web-client";process.env.SESSION_SECRET=randomBytes(32).toString("base64");
  const exchanges:URLSearchParams[]=[];const verified:string[]=[];
  globalThis.fetch=async (input,init)=>{
   assert.equal(String(input).startsWith("https://auth.example/oauth2/"),true);
   const body=new URLSearchParams(String(init?.body));exchanges.push(body);
   return new Response(JSON.stringify({access_token:"verified-access",refresh_token:body.get("grant_type")==="authorization_code"?"private-refresh":undefined,expires_in:900}),{status:200});
  };
  const handlers=createOAuthHandlers("/command",async request=>{verified.push(request.headers.get("authorization")!);});
  const login=await handlers.login(new Request("https://dealer.example/command/auth/login?returnTo=/command/leads"));
  const state=new URL(login.headers.get("location")!).searchParams.get("state")!;
  const callback=await handlers.callback(new Request(`https://dealer.example/command/auth/callback?state=${state}&code=provider-code`,{headers:{cookie:login.headers.getSetCookie()[0].split(";")[0]}}));
  assert.equal(callback.status,303);assert.equal(callback.headers.get("location"),"https://dealer.example/command/leads");
  assert.equal(exchanges[0].get("grant_type"),"authorization_code");assert.ok(exchanges[0].get("code_verifier"));
  const cookies=callback.headers.getSetCookie();assert.ok(cookies.some(v=>v.startsWith("__Host-vandlabs-access-token=verified-access")));
  const refreshCookie=cookies.find(v=>v.startsWith("__Host-vandlabs-refresh="))!.split(";")[0];assert.equal(refreshCookie.includes("private-refresh"),false);
  const refresh=await handlers.refresh(new Request("https://dealer.example/command/auth/refresh?returnTo=/command/tasks",{headers:{cookie:refreshCookie}}));
  assert.equal(refresh.status,303);assert.equal(exchanges[1].get("refresh_token"),"private-refresh");assert.deepEqual(verified,["Bearer verified-access","Bearer verified-access"]);
  const logout=await handlers.logout(new Request("https://dealer.example/command/auth/logout",{method:"POST",headers:{origin:"https://dealer.example",cookie:refreshCookie}}));
  assert.equal(logout.status,303);assert.equal(exchanges[2].get("token"),"private-refresh");assert.equal(logout.headers.getSetCookie().length,3);
  const denied=createOAuthHandlers("/command",async()=>{throw new Error("Not provisioned");});
  const rejected=await denied.refresh(new Request("https://dealer.example/command/auth/refresh",{headers:{cookie:refreshCookie}}));
  assert.equal(rejected.status,401);assert.equal(rejected.headers.getSetCookie().length,0);
 }finally{globalThis.fetch=originalFetch;for(const key of keys)if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}
});
