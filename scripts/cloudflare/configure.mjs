import {readFile,writeFile} from "node:fs/promises";
export function deploymentOrigin(value) {
  const url=new URL(value ?? "");
  if(url.protocol!=="https:"||url.username||url.password||url.pathname!=="/"||url.search||url.hash||url.hostname.endsWith(".example")||url.hostname==="example.com")throw new Error("Set CF_PUBLIC_ORIGIN to your real HTTPS origin without a path.");
  return url.origin;
}
const target=process.env.CF_ENVIRONMENT ?? "staging";
if(!["staging","production"].includes(target))throw new Error("CF_ENVIRONMENT must be staging or production.");
if(target==="staging" && process.env.SEO_INDEXABLE==="true")throw new Error("Staging must not be indexed.");
const prefix=target==="production"?"vandlabs":"vandlabs-staging";
const resource=name=>`${prefix}-${name}`;
const origin=deploymentOrigin(process.env.CF_PUBLIC_ORIGIN);
const hostname=new URL(origin).hostname;
const workersDev=hostname.endsWith(".workers.dev");
if(workersDev && !hostname.startsWith(resource("gateway")+"."))throw new Error("workers.dev origin must match the gateway Worker name.");
const shared=process.env.CF_SHARED_DATA === "true";
if(shared) {
  const url=new URL(process.env.DATABASE_URL ?? "");
  if(!url.hostname.endsWith(".neon.tech")||!url.hostname.includes("-pooler.")||url.username!==(process.env.APPLICATION_DATABASE_USER ?? "vandlabs_runtime"))throw new Error("Use the pooled Neon restricted runtime role URL.");
  for(const key of ["TENANT_CONFIG_JSON","SESSION_SECRET","OIDC_ISSUER","OIDC_AUDIENCE","OIDC_JWKS_URL","OIDC_CLIENT_ID","OIDC_AUTHORIZE_URL","OIDC_TOKEN_URL","OIDC_REVOKE_URL"])if(!process.env[key])throw new Error(`Configure ${key} before selecting shared mode.`);
  const config=JSON.parse(process.env.TENANT_CONFIG_JSON);
  if(config.seo.canonicalBase.replace(/\/$/,"")!==origin)throw new Error("Tenant canonicalBase must match CF_PUBLIC_ORIGIN.");
}
for(const name of ["web","command-center","platform"]) {
  const path=`apps/${name}/wrangler.jsonc`, config=JSON.parse(await readFile(path,"utf8"));
  config.account_id=process.env.CLOUDFLARE_ACCOUNT_ID || "98f548fdf2e2be84591c6669493f330b";
  config.name=resource(name);
  for(const binding of config.services ?? [])if(binding.binding==="WORKER_SELF_REFERENCE")binding.service=config.name;
  for(const binding of config.durable_objects?.bindings ?? [])if(binding.name==="ADMISSION")binding.script_name=resource("admission");
  for(const binding of config.r2_buckets ?? [])binding.bucket_name=resource(binding.binding==="VEHICLE_MEDIA"?"vehicle-media":`${name}-cache`);
  config.vars={...config.vars,DEPLOYMENT_ENVIRONMENT:target,APP_ORIGIN:origin,SITE_ORIGIN:origin,DATA_MODE:shared?"neon":"demo",AUTH_MODE:shared?"oidc":"demo",NEXT_PUBLIC_PREVIEW_READ_ONLY:shared?"false":"true",SEO_INDEXABLE:target==="staging"?"false":process.env.SEO_INDEXABLE ?? "false",NOTIFICATIONS_ENABLED:process.env.NOTIFICATIONS_ENABLED ?? "false"};
  await writeFile(path,JSON.stringify(config,null,2)+"\n");
}
const path="infra/cloudflare/wrangler.jsonc",config=JSON.parse(await readFile(path,"utf8"));
config.account_id=process.env.CLOUDFLARE_ACCOUNT_ID || "98f548fdf2e2be84591c6669493f330b";
config.name=resource("gateway");
for(const binding of config.services ?? [])binding.service=resource({WEB:"web",COMMAND:"command-center",PLATFORM:"platform"}[binding.binding]);
for(const binding of config.durable_objects?.bindings ?? [])if(binding.name==="ADMISSION")binding.script_name=resource("admission");
for(const binding of config.r2_buckets ?? [])binding.bucket_name=resource("vehicle-media");
config.vars.PUBLIC_ORIGIN=origin;
config.workers_dev=workersDev;
config.preview_urls=false;
config.routes=workersDev?[]:[{pattern:hostname,custom_domain:true}];
await writeFile(path,JSON.stringify(config,null,2)+"\n");
for(const name of ["admission","notifications"]) {
  const path=`infra/cloudflare/${name}.wrangler.jsonc`,config=JSON.parse(await readFile(path,"utf8"));
  config.name=resource(name);
  config.account_id=process.env.CLOUDFLARE_ACCOUNT_ID || "98f548fdf2e2be84591c6669493f330b";
  await writeFile(path,JSON.stringify(config,null,2)+"\n");
}
console.log(`Cloudflare ${target} configs generated. No credentials were written into them.`);
