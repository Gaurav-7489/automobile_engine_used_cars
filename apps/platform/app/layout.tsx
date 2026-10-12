import "./globals.css";
import { WorkspaceNav, WorkspaceMenu } from "@vandlabs/design-system/navigation";

const nav = [
  ["Overview", "/"],
  ["Dealerships", "/dealerships"],
  ["Organizations", "/organizations"],
  ["Onboarding", "/onboarding"],
  ["Health", "/health"],
  ["Integrations", "/integrations"],
  ["Features", "/features"],
  ["Audit", "/audit"],
  ["Staff", "/staff"],
] as const;

export const metadata = {
  title: "Platform Control Center | VandLabs",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#workspace-content">Skip to workspace</a>
        <div className="platform-shell">
          <header className="platform-header">
            <div>
              <strong>VANDLABS · AUTOMOBILE ENGINE</strong>
              <span>Platform Control Center</span>
            </div>
            <span className="environment">{["aurora", "neon"].includes(process.env.DATA_MODE ?? "")?"SHARED OPERATIONS":"REFERENCE DATA"}</span>
          </header>
          <WorkspaceNav items={nav} basePath="/platform" className="nav" label="Platform navigation" /><form className="desktop-signout" action="/platform/auth/logout" method="post"><button type="submit">Sign out</button></form>
          <WorkspaceMenu items={nav} basePath="/platform" label="Platform" />
          <div id="workspace-content" tabIndex={-1}>{children}</div>
        </div>
      </body>
    </html>
  );
}
