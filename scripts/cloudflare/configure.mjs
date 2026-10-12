import {readFile,writeFile} from "node:fs/promises";
export function deploymentOrigin(value) {
  const url=new URL(value ?? "");
  if(url.protocol!=="https:"||url.username||url.password||url.pathname!=="/"||url.search||url.hash||url.hostname.endsWith(".example")||url.hostname==="example.com")throw new Error("Set CF_PUBLIC_ORIGIN to your real HTTPS origin without a path.");
  return url.origin;
}
const origin=deploymentOrigin(process.env.CF_PUBLIC_ORIGIN);
const shared=process.env.CF_SHARED_DATA === "true";
if(shared) {
  const url=new URL(process.env.DATABASE_URL ?? "");
  if(!url.hostname.endsWith(".neon.tech")||!url.hostname.includes("-pooler.")||url.username!=="vandlabs_app")throw new Error("Use the pooled Neon vandlabs_app role URL.");
  for(const key of ["TENANT_CONFIG_JSON","SESSION_SECRET","OIDC_ISSUER","OIDC_AUDIENCE","OIDC_JWKS_URL","OIDC_CLIENT_ID","OIDC_AUTHORIZE_URL","OIDC_TOKEN_URL","OIDC_REVOKE_URL"])if(!process.env[key])throw new Error(`Configure ${key} before selecting shared mode.`);
  const config=JSON.parse(process.env.TENANT_CONFIG_JSON);
  if(config.seo.canonicalBase.replace(/\/$/,"")!==origin)throw new Error("Tenant canonicalBase must match CF_PUBLIC_ORIGIN.");
}
for(const name of ["web","command-center","platform"]) {
  const path=`apps/${name}/wrangler.jsonc`, config=JSON.parse(await readFile(path,"utf8"));
  config.account_id=process.env.CLOUDFLARE_ACCOUNT_ID || "98f548fdf2e2be84591c6669493f330b";
  config.vars={...config.vars,APP_ORIGIN:origin,SITE_ORIGIN:origin,DATA_MODE:shared?"neon":"demo",AUTH_MODE:shared?"oidc":"demo",NEXT_PUBLIC_PREVIEW_READ_ONLY:shared?"false":"true",SEO_INDEXABLE:process.env.SEO_INDEXABLE ?? "true",NOTIFICATIONS_ENABLED:process.env.NOTIFICATIONS_ENABLED ?? "false"};
  await writeFile(path,JSON.stringify(config,null,2)+"\n");
}
const path="infra/cloudflare/wrangler.jsonc",config=JSON.parse(await readFile(path,"utf8"));
config.account_id=process.env.CLOUDFLARE_ACCOUNT_ID || "98f548fdf2e2be84591c6669493f330b";
config.vars.PUBLIC_ORIGIN=origin;config.routes=[{pattern:new URL(origin).hostname,custom_domain:true}];
await writeFile(path,JSON.stringify(config,null,2)+"\n");
console.log("Cloudflare configs generated. No credentials were written into them.");
