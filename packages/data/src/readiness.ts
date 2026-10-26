type Environment = Record<string,string|undefined>;
export type Surface = "web"|"command"|"platform";
export interface ReadinessCheck {key:string;ready:boolean;detail:string}
export function runtimeReadiness(surface:Surface,env:Environment=process.env) {
  const shared=["aurora", "neon"].includes(env.DATA_MODE ?? "");
  const hosted=env.VERCEL==="1"||env.HOSTING_PROVIDER==="cloudflare";
  const preview=env.NEXT_PUBLIC_PREVIEW_READ_ONLY==="true"||(hosted&&!shared);
  const checks:ReadinessCheck[]=[
    {key:"data",ready:shared,detail:shared?"Shared PostgreSQL selected":"Local reference adapter selected; hosted apps cannot share its files"},
    {key:"database",ready:Boolean(env.DATABASE_URL),detail:"Provide a shared application-role connection through secure server configuration"},
    {key:"tenant",ready:Boolean(env.TENANT_CONFIG_JSON),detail:"All three apps require the same tenant/dealership/location identifiers"},
    {key:"write-mode",ready:!preview,detail:preview?"Browse-only preview; operational writes disabled":"Operational write mode selected"},
    {key:"tls",ready:env.DATABASE_TLS!=="off",detail:"Database TLS and certificate verification are required"},
  ];
  if(surface==="web") checks.push({key:"public-rate-limit",ready:env.HOSTING_PROVIDER==="cloudflare"||Boolean(env.UPSTASH_REDIS_REST_URL&&env.UPSTASH_REDIS_REST_TOKEN),detail:"Public writes require the Cloudflare durable limiter binding or shared Redis"});
  if(surface!=="web") {
    for(const key of (env.AUTH_MODE === "oidc" ? ["APP_ORIGIN","SESSION_SECRET","OIDC_ISSUER","OIDC_AUDIENCE","OIDC_JWKS_URL","OIDC_CLIENT_ID","OIDC_AUTHORIZE_URL","OIDC_TOKEN_URL","OIDC_REVOKE_URL"] : ["APP_ORIGIN","SESSION_SECRET","GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET"]))checks.push({key,ready:Boolean(env[key]),detail:`Configure ${key} on this staff application`});
    checks.push({key:"auth-mode",ready:["oidc","google"].includes(env.AUTH_MODE ?? ""),detail:"Verified Google or OIDC identity is required for shared data"});
    checks.push({key:"staff-scopes",ready:env.AUTH_REGISTRY_MODE==="database"||Boolean(env.AUTH_PRINCIPALS_JSON),detail:"Configure the database staff registry or the server-owned environment registry"});
  }
  return {surface,mode:preview?"browse-only":shared?"shared":"local-reference",ready:checks.every(x=>x.ready),checks};
}
