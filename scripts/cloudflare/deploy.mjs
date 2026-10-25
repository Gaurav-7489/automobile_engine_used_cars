import {spawn} from "node:child_process";
import {readFile} from "node:fs/promises";
function run(command,args,cwd=".",input) {
 return new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd,env:process.env,stdio:[input?"pipe":"inherit","inherit","inherit"]});if(input)child.stdin.end(input);child.on("error",reject);child.on("exit",code=>code===0?resolve():reject(new Error(`${command} failed (${code})`)));});
}
const gateway=JSON.parse(await readFile("infra/cloudflare/wrangler.jsonc","utf8"));
if((!gateway.routes?.length && !gateway.workers_dev) || gateway.vars.PUBLIC_ORIGIN.includes(".example"))throw new Error("Run pnpm cf:configure with the deployment origin first.");
if(!process.env.CLOUDFLARE_API_TOKEN)throw new Error("Provide a scoped CLOUDFLARE_API_TOKEN through the secret store.");
// The Dealer AI Worker accepts only 43-character base64url bearer tokens (32 random bytes).
const aiToken=/^[A-Za-z0-9_-]{43}$/;
for(const key of ["DEALER_AI_SERVICE_TOKEN","DEALER_AI_SERVICE_TOKEN_ALTERNATE","DISCOVERY_AI_SERVICE_TOKEN","DISCOVERY_AI_SERVICE_TOKEN_ALTERNATE"])if(process.env[key]&&!aiToken.test(process.env[key]))throw new Error(`${key} must be 32 random bytes encoded as base64url (43 characters).`);
if(process.env.INTELLIGENCE_SESSION_SECRET&&(process.env.INTELLIGENCE_SESSION_SECRET.length<32||process.env.INTELLIGENCE_SESSION_SECRET===process.env.SESSION_SECRET))throw new Error("INTELLIGENCE_SESSION_SECRET must be at least 32 characters and differ from SESSION_SECRET.");
if(process.env.DEALER_AI_SERVICE_TOKEN_ALTERNATE&&!process.env.DEALER_AI_SERVICE_TOKEN)throw new Error("DEALER_AI_SERVICE_TOKEN_ALTERNATE requires DEALER_AI_SERVICE_TOKEN.");
if(process.env.DISCOVERY_AI_SERVICE_TOKEN_ALTERNATE&&!process.env.DISCOVERY_AI_SERVICE_TOKEN)throw new Error("DISCOVERY_AI_SERVICE_TOKEN_ALTERNATE requires DISCOVERY_AI_SERVICE_TOKEN.");
if(process.env.DISCOVERY_AI_SERVICE_TOKEN&&process.env.DISCOVERY_AI_SERVICE_TOKEN===process.env.DEALER_AI_SERVICE_TOKEN)throw new Error("Use a different token for buyer discovery and dealer commentary.");
const app=JSON.parse(await readFile("apps/web/wrangler.jsonc","utf8"));
if(app.vars.DATA_MODE === "neon") {
 await run("pnpm",["deployment:doctor","web","--probe"]);
 await run("pnpm",["deployment:doctor","command"]);
 await run("pnpm",["deployment:doctor","platform"]);
}
// Create private storage and cache buckets if absent. Billing activation is a separate account step.
const account=gateway.account_id || process.env.CLOUDFLARE_ACCOUNT_ID;
const resourceApi=async(method,path,body)=>{
 const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets${path}`,{method,signal:AbortSignal.timeout(10000),redirect:"error",headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
 const result=await response.json();if(!response.ok || !result.success)throw new Error("R2 provisioning failed. Check account billing and scoped bucket permissions.");return result.result;
};
const existing=await resourceApi("GET","");
const names=new Set((existing.buckets ?? []).map(bucket=>bucket.name));
const requiredBuckets=new Set((gateway.r2_buckets ?? []).map(binding=>binding.bucket_name));
for(const name of ["web","command-center","platform","intelligence"]) {
 const config=JSON.parse(await readFile(`apps/${name}/wrangler.jsonc`,"utf8"));
 for(const binding of config.r2_buckets ?? [])requiredBuckets.add(binding.bucket_name);
}
for(const name of requiredBuckets)if(!names.has(name))await resourceApi("POST","",{name});
// Deploy the durable coordinator before Workers that bind to it.
await run("pnpm",["exec","wrangler","deploy","--config","infra/cloudflare/admission.wrangler.jsonc"]);
// Deploy Dealer AI before the Command Center binds to it. Its accepted tokens come from the same
// secrets the callers use; the alternate is accepted only while a rotation is in progress.
await run("pnpm",["exec","wrangler","deploy","--config","infra/cloudflare/dealer-ai/wrangler.jsonc"]);
// Route-scoped credentials: the dealer token unlocks /explain only, the discovery token /discover only.
const aiSecrets={...(process.env.DEALER_AI_SERVICE_TOKEN?{SERVICE_TOKEN:process.env.DEALER_AI_SERVICE_TOKEN,SERVICE_TOKEN_ALTERNATE:process.env.DEALER_AI_SERVICE_TOKEN_ALTERNATE||"retired"}:{}),...(process.env.DISCOVERY_AI_SERVICE_TOKEN?{DISCOVERY_TOKEN:process.env.DISCOVERY_AI_SERVICE_TOKEN,DISCOVERY_TOKEN_ALTERNATE:process.env.DISCOVERY_AI_SERVICE_TOKEN_ALTERNATE||"retired"}:{})};
if(Object.keys(aiSecrets).length)await run("pnpm",["exec","wrangler","secret","bulk","--config","infra/cloudflare/dealer-ai/wrangler.jsonc"],".",JSON.stringify(aiSecrets));
const secretKeys=["COGNITO_DOMAIN","COGNITO_USER_POOL_ID","COGNITO_CLIENT_ID","COGNITO_CLIENT_IDS","COGNITO_DESKTOP_CLIENT_ID","DATABASE_URL","TENANT_CONFIG_JSON","SESSION_SECRET","AUTH_PRINCIPALS_JSON","AUTH_REGISTRY_MODE","OIDC_ISSUER","OIDC_AUDIENCE","OIDC_JWKS_URL","OIDC_CLIENT_ID","OIDC_AUTHORIZE_URL","OIDC_TOKEN_URL","OIDC_REVOKE_URL","OIDC_DESKTOP_CLIENT_ID","OIDC_RESOURCE","GOOGLE_SITE_VERIFICATION","DEALER_AI_URL","DEALER_AI_SERVICE_TOKEN","DISCOVERY_AI_SERVICE_TOKEN","VANDLABS_FEEDS_JSON","VANDLABS_FEED_TOKENS_JSON","RESEND_API_KEY","NOTIFICATION_FROM","NOTIFICATION_TO"];
const secrets=Object.fromEntries(secretKeys.filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
if(process.env.AUTH_MODE === "cognito" && !secrets.COGNITO_CLIENT_IDS && secrets.COGNITO_CLIENT_ID && secrets.COGNITO_DESKTOP_CLIENT_ID)secrets.COGNITO_CLIENT_IDS=[secrets.COGNITO_CLIENT_ID,secrets.COGNITO_DESKTOP_CLIENT_ID].join(",");
const commandOnly=new Set(["DEALER_AI_URL","DEALER_AI_SERVICE_TOKEN"]),webOnly=new Set(["DISCOVERY_AI_SERVICE_TOKEN"]);
for(const name of ["web","command-center","platform"]) {
 const cwd=`apps/${name}`,appSecrets=Object.fromEntries(Object.entries(secrets).filter(([key])=>(name==="command-center"||!commandOnly.has(key))&&(name==="web"||!webOnly.has(key))));
 await run("pnpm",["cf:deploy"],cwd);
 if(Object.keys(appSecrets).length)await run("pnpm",["exec","wrangler","secret","bulk"],cwd,JSON.stringify(appSecrets));
}
{
 // Intelligence is behind the gateway under /intelligence. It has its own session secret, so its sessions are
 // never valid for the other apps and the reverse; without one its sign-in fails closed.
 const intelligenceSecrets=Object.fromEntries([...["DATABASE_URL","COGNITO_DOMAIN","INTELLIGENCE_COGNITO_CLIENT_ID"].filter(key=>process.env[key]).map(key=>[key,process.env[key]]),...(process.env.INTELLIGENCE_SESSION_SECRET?[["SESSION_SECRET",process.env.INTELLIGENCE_SESSION_SECRET]]:[])]);
 await run("pnpm",["cf:deploy"],"apps/intelligence");
 if(Object.keys(intelligenceSecrets).length)await run("pnpm",["exec","wrangler","secret","bulk"],"apps/intelligence",JSON.stringify(intelligenceSecrets));
}
// The gateway binds to every app Worker, so it deploys last.
await run("pnpm",["exec","wrangler","deploy","--config","infra/cloudflare/wrangler.jsonc"]);
if(process.env.NOTIFICATIONS_ENABLED === "true") {
 await run("pnpm",["exec","wrangler","deploy","--config","infra/cloudflare/notifications.wrangler.jsonc"]);
 const notificationSecrets={...Object.fromEntries(["DATABASE_URL","RESEND_API_KEY","NOTIFICATION_FROM","NOTIFICATION_TO","APP_ORIGIN"].map(key=>[key,process.env[key]])),NOTIFICATION_TENANT_ID:JSON.parse(process.env.TENANT_CONFIG_JSON).tenantId};
 await run("pnpm",["exec","wrangler","secret","bulk","--config","infra/cloudflare/notifications.wrangler.jsonc"],".",JSON.stringify(notificationSecrets));
}
console.log("Deployment commands completed. Run live acceptance before DNS cutover from existing hosting.");
