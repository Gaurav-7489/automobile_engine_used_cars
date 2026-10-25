import "./globals.css";
import { headers } from "next/headers";
import { commandNavigation } from "@vandlabs/contracts";
import { accessError } from "@vandlabs/server-auth";
import { resolvePrincipal } from "../lib/auth";
import { WorkspaceNav, WorkspaceMenu } from "@vandlabs/design-system/navigation";
import { tenantConfig } from "@vandlabs/data";



export const metadata = {
  title: "Command Center | VandLabs Automobile Engine",
  robots: { index: false, follow: false },
};

/** Link to the separately deployed Automobile Intelligence app; only http(s) origins are accepted. */
function intelligenceUrl(): string | null {
  const value = process.env.INTELLIGENCE_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

export default async function Layout({ children }: { children: React.ReactNode }) {
  let nav: readonly (readonly [string, string])[] = [];
  try {
    nav = commandNavigation(await resolvePrincipal(new Request(process.env.APP_ORIGIN || "http://localhost:3001", { headers: await headers() })));
  } catch (error) {
    // Public login pages render without staff navigation. Protected pages and APIs
    // perform their own authorization; unexpected infrastructure failures surface.
    if (!accessError(error)) throw error;
  }
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
            <WorkspaceNav items={nav} basePath="/command" label="Command Center" />{nav.length && intelligenceUrl() ? <a className="muted" href={intelligenceUrl()!} rel="noopener">Open Automobile Intelligence ↗</a> : null}{nav.length ? <form action="/command/auth/logout" method="post"><button type="submit">Sign out</button></form> : null}
            <div className="sidebar-foot">
              <span className="status-dot" />
              {["aurora", "neon"].includes(process.env.DATA_MODE ?? "") ? "Connected operations" : "Demonstration data"}
            </div>
          </aside>
          <div className="app-content" id="workspace-content" tabIndex={-1}>
            <WorkspaceMenu items={nav} basePath="/command" label="Command Center" />
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
