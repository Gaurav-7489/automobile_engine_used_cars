import { safeReturnTo } from "@vandlabs/server-auth/oauth";

export const dynamic = "force-dynamic";

export default async function Login({searchParams}:{searchParams:Promise<{returnTo?:string}>}) {
  const params = await searchParams;
  const target = safeReturnTo(params.returnTo || null, "/command");
  const configured = ["APP_ORIGIN", "COGNITO_DOMAIN", "COGNITO_CLIENT_ID", "COGNITO_USER_POOL_ID", "SESSION_SECRET"]
    .every(key => Boolean(process.env[key])) && (process.env.AUTH_REGISTRY_MODE === "database" || Boolean(process.env.AUTH_PRINCIPALS_JSON));
  return <main className="main"><section className="panel login-panel">
    <span className="connection-state">{configured ? "Secure dealership access" : "Preview · setup pending"}</span>
    <p className="eyebrow" style={{marginTop:24}}>VandLabs Automobile Engine</p>
    <h1>{configured ? "Sign in to your workspace" : "Staff sign-in is not connected yet"}</h1>
    {configured ? <><p>Use your dealership staff account. Your permissions follow you across web and desktop.</p>
      <a className="signin-button" href={"/command/auth/login?returnTo=" + encodeURIComponent(target)}>Continue with secure sign-in <span aria-hidden="true">↗</span></a></>
      : <p>This deployment is a protected preview. A platform administrator must configure staff authentication and the shared database before dealership operations can be used.</p>}
  </section></main>;
}
