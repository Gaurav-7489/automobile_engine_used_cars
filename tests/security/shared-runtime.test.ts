import {test} from "node:test";
import assert from "node:assert/strict";
import { databaseOptions } from "../../packages/data/src/postgres";
import { runtimeReadiness } from "../../packages/data/src/readiness";
import { AuthorizationError, type AuthenticatedPrincipal } from "../../packages/contracts/src/index";
import { createPrincipalResolver, AuthenticationError } from "../../packages/server-auth/src/index";

test("database URLs cannot weaken verified TLS or override the explicit CA",()=>{
  const options=databaseOptions({DATABASE_URL:"postgresql://test:test@db.example/app?sslmode=no-verify&sslrootcert=ignored&ssl=false",DATABASE_SSL_CA:"trusted-ca",NODE_ENV:"production",VERCEL:"1"});
  assert.deepEqual(options.ssl,{rejectUnauthorized:true,ca:"trusted-ca"});assert.equal(options.max,2);
  assert.ok(!options.connectionString?.includes("ssl"));
  assert.throws(()=>databaseOptions({DATABASE_URL:"postgresql://db/app",DATABASE_TLS:"off",NODE_ENV:"production"}),/TLS/);
  assert.throws(()=>databaseOptions({DATABASE_URL:"postgresql://db/app",DATABASE_POOL_MAX:"0"}),/DATABASE_POOL_MAX/);
  assert.throws(()=>databaseOptions({DATABASE_URL:"https://db.example"}),/configuration/);
  assert.equal(databaseOptions({DATABASE_URL:"postgresql://db/app",DATABASE_TLS:"off",NODE_ENV:"development"}).ssl,false);
});
test("readiness reports configuration gaps without returning values",()=>{
  const r=runtimeReadiness("platform",{VERCEL:"1",DATA_MODE:"demo",SESSION_SECRET:"secret-sentinel"});
  assert.equal(r.ready,false);assert.equal(r.mode,"browse-only");assert.ok(r.checks.some(c=>c.key==="database"&&!c.ready));
  assert.ok(!JSON.stringify(r).includes("secret-sentinel"));
});
test("persisted permissions are consulted on every verified request, revocation beats old environment grants",async()=>{
  const principal:AuthenticatedPrincipal={userId:"staff",tenantId:"tenant",dealershipIds:["dealer"],locationIds:["location"],capabilities:["lead:read"]};
  let active:AuthenticatedPrincipal|null=principal,calls=0;
  const env={AUTH_MODE:"cognito",AUTH_REGISTRY_MODE:"database",AUTH_PRINCIPALS_JSON:JSON.stringify({staff:principal})};
  const resolver=createPrincipalResolver({env,demoPrincipal:principal,verifyToken:async()=>({sub:"staff"}),lookupPrincipal:async()=>{calls++;return active;}});
  const request=new Request("https://operations.example/command",{headers:{authorization:"Bearer verified"}});
  assert.deepEqual(await resolver(request),principal);active=null;await assert.rejects(resolver(request),AuthorizationError);assert.equal(calls,2);
  active={...principal,userId:"other"};await assert.rejects(resolver(request),AuthorizationError);
  const missing=createPrincipalResolver({env,demoPrincipal:principal,verifyToken:async()=>({sub:"staff"})});await assert.rejects(missing(request),AuthenticationError);
});
test("platform scopes come only from validated server provisioning",async()=>{
  const p:AuthenticatedPrincipal={userId:"admin",tenantId:"platform",dealershipIds:[],locationIds:[],capabilities:["platform:admin"],platformTenantIds:["tenant-a"]};
  const request=new Request("https://platform.example/platform",{headers:{authorization:"Bearer verified","x-vandlabs-platform-tenants":"tenant-b"}});
  const resolver=createPrincipalResolver({env:{AUTH_MODE:"cognito",AUTH_REGISTRY_MODE:"database",AUTH_PRINCIPALS_JSON:JSON.stringify({admin:p})},demoPrincipal:p,verifyToken:async()=>({sub:"admin"}),lookupPrincipal:async()=>{throw new Error("bootstrap should not query business scope");}});
  assert.deepEqual(await resolver(request),p);
  const empty=createPrincipalResolver({env:{AUTH_MODE:"cognito",AUTH_REGISTRY_MODE:"database",AUTH_PRINCIPALS_JSON:JSON.stringify({admin:{...p,platformTenantIds:[]}})},demoPrincipal:p,verifyToken:async()=>({sub:"admin"})});
  await assert.rejects(empty(request),AuthenticationError);
});
