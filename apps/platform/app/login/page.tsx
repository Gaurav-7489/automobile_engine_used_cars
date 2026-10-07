import { safeReturnTo } from "@vandlabs/server-auth/oauth";
export default async function Login({searchParams}:{searchParams:Promise<{returnTo?:string}>}) {
 const params=await searchParams;
 const target=safeReturnTo(params.returnTo||null,"/platform");
 return <main className="main"><section className="panel"><p className="eyebrow">VandLabs Automobile Engine</p><h1>Sign in to your workspace</h1><p>Use your dealership staff account. Your permissions follow you across web and desktop.</p><a href={"/platform/auth/login?returnTo="+encodeURIComponent(target)}>Continue with secure sign-in</a></section></main>;
}
