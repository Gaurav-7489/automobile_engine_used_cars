import Link from "next/link";
import { Brand } from "@/components/brand";
import { InstallApp } from "@/components/install-app";

export const metadata = { title: "Install VandLabs Auto" };

export default function InstallPage() {
  return <main className="login-form-wrap" id="content" tabIndex={-1}>
    <div className="login-form stack">
      <Brand href="/" sub={false} />
      <h1 className="h1">Your whole workspace. One app.</h1>
      <p>Install VandLabs Auto on your computer or phone. Sign in once: VandLabs administrators open the admin console; dealer owners and staff open their own dealership workspace.</p>
      <InstallApp />
      <div className="row-flex"><Link href="/login" className="btn btn-primary">Open sign-in</Link><a href="/" className="btn">Browse showroom</a></div>
    </div>
  </main>;
}
