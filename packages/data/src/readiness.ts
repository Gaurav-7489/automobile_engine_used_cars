type Environment = Record<string,string|undefined>;
export type Surface = "web"|"command"|"platform";
export interface ReadinessCheck {key:string;ready:boolean;detail:string}
export function runtimeReadiness(surface:Surface,env:Environment=process.env) {
  const shared=env.DATA_MODE==="aurora";
  const hosted=env.VERCEL==="1";
  const preview=env.NEXT_PUBLIC_PREVIEW_READ_ONLY==="true"||(hosted&&!shared);
  const checks:ReadinessCheck[]=[
    {key:"data",ready:shared,detail:shared?"Shared PostgreSQL selected":"Local reference adapter selected; hosted apps cannot share its files"},
    {key:"database",ready:Boolean(env.DATABASE_URL||(env.DATABASE_SECRET_ARN&&env.DATABASE_HOST&&env.DATABASE_NAME)),detail:"Provide a shared application-role connection through secure server configuration"},
    {key:"tenant",ready:Boolean(env.TENANT_CONFIG_JSON),detail:"All three apps require the same tenant/dealership/location identifiers"},
    {key:"write-mode",ready:!preview,detail:preview?"Browse-only preview; operational writes disabled":"Operational write mode selected"},
    {key:"tls",ready:env.DATABASE_TLS!=="off",detail:"Database TLS and certificate verification are required"},
  ];
  if(surface!=="web") {
    for(const key of ["APP_ORIGIN","COGNITO_DOMAIN","COGNITO_USER_POOL_ID","COGNITO_CLIENT_ID","SESSION_SECRET"])checks.push({key,ready:Boolean(env[key]),detail:`Configure ${key} on this staff application`});
    checks.push({key:"auth-mode",ready:env.AUTH_MODE==="cognito",detail:"Cognito identity verification is required for shared data"});
    checks.push({key:"staff-scopes",ready:env.AUTH_REGISTRY_MODE==="database"||Boolean(env.AUTH_PRINCIPALS_JSON),detail:"Configure the database staff registry or the server-owned environment registry"});
  }
  return {surface,mode:preview?"browse-only":shared?"shared":"local-reference",ready:checks.every(x=>x.ready),checks};
}
