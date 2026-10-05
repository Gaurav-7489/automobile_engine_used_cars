import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { AuthenticationError } from "./index";
export interface OAuthConfig { origin:string; domain:string; clientId:string; secret:string; basePath:string }
export function oauthConfig(basePath:string):OAuthConfig {
  const {APP_ORIGIN,COGNITO_DOMAIN,COGNITO_CLIENT_ID,SESSION_SECRET}=process.env;
  if(!APP_ORIGIN||!COGNITO_DOMAIN||!COGNITO_CLIENT_ID||!SESSION_SECRET)throw new AuthenticationError(503,"Sign-in is not configured.");
  const origin=new URL(APP_ORIGIN).origin, domain=new URL(COGNITO_DOMAIN).origin;
  if(!origin.startsWith("https://")||!domain.startsWith("https://")||Buffer.from(SESSION_SECRET,"base64").length!==32)throw new AuthenticationError(503,"Sign-in configuration is invalid.");
  return {origin,domain,clientId:COGNITO_CLIENT_ID,secret:SESSION_SECRET,basePath};
}
export function seal(value:unknown,secret:string) {
  const iv=randomBytes(12);const cipher=createCipheriv("aes-256-gcm",Buffer.from(secret,"base64"),iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString("base64url");
}
export function unseal<T>(value:string,secret:string):T {
  const data=Buffer.from(value,"base64url");if(data.length<29)throw new Error("Invalid session.");
  const cipher=createDecipheriv("aes-256-gcm",Buffer.from(secret,"base64"),data.subarray(0,12));cipher.setAuthTag(data.subarray(12,28));
  return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString("utf8"));
}
export function safeReturnTo(value:string|null,basePath:string) {
  if(!value||!value.startsWith(basePath)||value.startsWith("//")||/[\\\r\n]/.test(value))return basePath;
  const parsed=new URL(value,"https://local.invalid");if(parsed.origin!=="https://local.invalid"||!(parsed.pathname===basePath||parsed.pathname.startsWith(basePath+"/")))return basePath;
  if(parsed.pathname.startsWith(basePath+"/auth")||parsed.pathname===basePath+"/login")return basePath;
  return parsed.pathname+parsed.search;
}
function cookie(request:Request,name:string) {
  const matches=(request.headers.get("cookie")||"").split(";").map(v=>v.trim()).filter(v=>v.startsWith(name+"="));
  if(matches.length!==1)throw new AuthenticationError(401,"Sign-in session expired.");return matches[0].slice(name.length+1);
}
function setCookie(response:Response,name:string,value:string,seconds:number) {
  response.headers.append("Set-Cookie",`${name}=${value}; Max-Age=${seconds}; Path=/; HttpOnly; Secure; SameSite=Lax`);
}
function redirect(url:string) {return new Response(null,{status:303,headers:{Location:url,"Cache-Control":"private, no-store"}});}
interface Tokens { access_token:string; refresh_token?:string; expires_in:number }
export async function exchange(config:OAuthConfig,params:Record<string,string>):Promise<Tokens> {
  const response=await fetch(config.domain+"/oauth2/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:config.clientId,...params}),signal:AbortSignal.timeout(10000),cache:"no-store",redirect:"error"});
  if(!response.ok)throw new AuthenticationError(401,"Sign-in failed.");const value=await response.json() as Tokens;
  if(typeof value.access_token!=="string"||!Number.isFinite(value.expires_in)||value.expires_in<=0||value.expires_in>86400)throw new AuthenticationError(401,"Invalid sign-in response.");return value;
}
export function createOAuthHandlers(basePath:string,authorize:(request:Request)=>Promise<unknown>) {
  async function protect(action:()=>Promise<Response>) {
    try{return await action();}catch(e){const status=e instanceof AuthenticationError?e.status:401;return new Response(JSON.stringify({error:status===503?"Sign-in is not configured.":"Sign-in failed. Please try again."}),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});}
  }
  function csrf(request:Request,c:OAuthConfig){if(request.headers.get("origin")!==c.origin)throw new AuthenticationError(401,"Invalid request origin.");}
  async function session(config:OAuthConfig,tokens:Tokens,target:string,previousRefresh?:string) {
    await authorize(new Request(config.origin+basePath,{headers:{authorization:`Bearer ${tokens.access_token}`}}));
    const response=redirect(config.origin+target);
    setCookie(response,"__Host-vandlabs-access-token",tokens.access_token,tokens.expires_in);
    const refresh=tokens.refresh_token||previousRefresh;
    if(refresh)setCookie(response,"__Host-vandlabs-refresh",seal({token:refresh,expires:Date.now()+30*86400000},config.secret),30*86400);
    setCookie(response,"__Host-vandlabs-oauth","",0);return response;
  }
  return {
    login(request:Request){return protect(async()=>{
      const c=oauthConfig(basePath);const verifier=randomBytes(32).toString("base64url"),state=randomBytes(32).toString("base64url");
      const returnTo=safeReturnTo(new URL(request.url).searchParams.get("returnTo"),basePath);
      const url=new URL(c.domain+"/oauth2/authorize");url.search=new URLSearchParams({response_type:"code",client_id:c.clientId,redirect_uri:c.origin+basePath+"/auth/callback",scope:"openid email profile",state,code_challenge_method:"S256",code_challenge:createHash("sha256").update(verifier).digest("base64url")}).toString();
      const response=redirect(url.toString());setCookie(response,"__Host-vandlabs-oauth",seal({state,verifier,returnTo,expires:Date.now()+600000},c.secret),600);return response;
    });},
    callback(request:Request){return protect(async()=>{
      const c=oauthConfig(basePath);const flow=unseal<{state:string;verifier:string;returnTo:string;expires:number}>(cookie(request,"__Host-vandlabs-oauth"),c.secret);
      const params=new URL(request.url).searchParams;const state=params.get("state")||"",code=params.get("code");
      if(flow.expires<Date.now()||!code||Buffer.byteLength(state)!==Buffer.byteLength(flow.state)||!timingSafeEqual(Buffer.from(state),Buffer.from(flow.state)))throw new AuthenticationError(401,"Invalid sign-in state.");
      return session(c,await exchange(c,{grant_type:"authorization_code",code,code_verifier:flow.verifier,redirect_uri:c.origin+basePath+"/auth/callback"}),safeReturnTo(flow.returnTo,basePath));
    });},
    refresh(request:Request){return protect(async()=>{
      const c=oauthConfig(basePath);const stored=unseal<{token:string;expires:number}>(cookie(request,"__Host-vandlabs-refresh"),c.secret);
      if(stored.expires<Date.now())throw new AuthenticationError(401,"Session expired.");
      return session(c,await exchange(c,{grant_type:"refresh_token",refresh_token:stored.token}),safeReturnTo(new URL(request.url).searchParams.get("returnTo"),basePath),stored.token);
    });},
    logout(request:Request){return protect(async()=>{
      const c=oauthConfig(basePath);csrf(request,c);
      try{const stored=unseal<{token:string}>(cookie(request,"__Host-vandlabs-refresh"),c.secret);
        await fetch(c.domain+"/oauth2/revoke",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:c.clientId,token:stored.token}),signal:AbortSignal.timeout(5000)});
      }catch{/* Always clear local session even if provider revocation is unavailable. */}
      const url=new URL(c.domain+"/logout");url.search=new URLSearchParams({client_id:c.clientId,logout_uri:c.origin+basePath+"/login"}).toString();const response=redirect(url.toString());
      for(const name of ["__Host-vandlabs-access-token","__Host-vandlabs-refresh","__Host-vandlabs-oauth"])setCookie(response,name,"",0);return response;
    });},
  };
}
