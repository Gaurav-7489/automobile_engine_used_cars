import Link from "next/link";
import { Brand } from "@/components/brand";

export default function NotFound() {
  return (
    <div className="landing" style={{ minHeight: "100dvh" }}>
      <header className="landing-header"><Brand sub={false} href="/" /><span /><Link href="/login" className="btn">Sign in</Link></header>
      <main id="content" tabIndex={-1} style={{ maxWidth: 640, display: "grid", gap: 16, paddingBlock: 64 }}>
        <h1 className="h1" id="page-title">This page is not available</h1>
        <p className="muted">The page does not exist, or you do not have access to it. Private records look the same either way.</p>
        <div className="row-flex"><Link href="/app/overview" className="btn btn-primary">Open Command Centre</Link><Link href="/" className="btn">Home</Link></div>
      </main>
    </div>
  );
}
