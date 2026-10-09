import "./globals.css";
import { WorkspaceNav } from "@vandlabs/design-system/navigation";
import { tenantConfig } from "@vandlabs/data";

const nav = [
  ["Overview", "/"],
  ["Leads", "/leads"],
  ["Pipeline", "/pipeline"],
  ["Tasks", "/tasks"],
  ["Appointments", "/appointments"],
  ["Inventory", "/inventory"],
  ["Customers", "/customers"],
  ["Analytics", "/analytics"],
  ["Intelligence", "/intelligence"],
  ["Capital", "/capital"],
  ["Automation", "/automation"],
  ["Settings", "/settings"],
] as const;

export const metadata = {
  title: "Command Center | VandLabs Automobile Engine",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#workspace-content">Skip to workspace</a>
        <div className="app-shell">
          <aside className="sidebar">
            <div>
              <span className="workspace-monogram" aria-hidden="true">V</span><strong className="wordmark">{tenantConfig.brand.logoText}</strong>
              <p className="muted">Dealership Command Center</p>
            </div>
            <WorkspaceNav items={nav} basePath="/command" label="Command Center" /><form action="/command/auth/logout" method="post"><button type="submit">Sign out</button></form>
            <div className="sidebar-foot">
              <span className="status-dot" />
              {process.env.DATA_MODE === "aurora" ? "Connected operations" : "Demonstration data"}
            </div>
          </aside>
          <div className="app-content" id="workspace-content" tabIndex={-1}>
            <WorkspaceNav items={nav} basePath="/command" className="mobile-nav" label="Command Center mobile" />
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
