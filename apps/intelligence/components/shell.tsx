"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Brand } from "./brand";
import { Icon } from "./icons";
import { Dialog } from "./overlay";
import { Menu } from "./overlay";
import { LiveEffects } from "./live-effects";
import { GlobalSearch, SearchTrigger } from "./search";
import { ToastProvider } from "./toast";
import { Button } from "./ui";
import { defaultBranchOf, useScopedHref, useUrlState, useWorkspace } from "./workspace";
import { initials } from "@/lib/format";
import { NAV, ROLE_LABEL } from "@/lib/permissions";
import { ALL_BRANCHES } from "@/lib/fixtures/branches";
import { alertCounts, alertsFor } from "@/lib/selectors";

const SHORTCUTS: [string, string][] = [["Ctrl / ⌘ + K", "Open global search"], ["/", "Open global search (outside fields)"], ["↑ ↓ then Enter", "Select and open a search result"], ["Esc", "Close a dialog, drawer or menu"], ["← → Home End", "Move between tabs"], ["Tab / Shift + Tab", "Move through controls; focus is always visible"]];

function activeKey(pathname: string): string {
  const segment = pathname.split("/")[2];
  return NAV.find((n) => n.key === segment)?.key ?? "overview";
}

function BranchSelect() {
  const { state, session, scope } = useWorkspace();
  const url = useUrlState();
  const home = defaultBranchOf(state);
  const permitted = state.branches.filter((b) => session.branchIds.includes(b.id));
  const choose = (value: string) => url.set({ branch: value === home ? null : value, cursor: null, page: null, selected: null });
  return (
    <div className="branch-select">
      <Menu label={`Branch scope: ${scope.label}`} icon="chevronDown" buttonClass="btn" align="right" text={<><span>{scope.label}</span><Icon name="chevronDown" size={16} /></>}>
        {(close) => (
          <>
            <div className="menu-label" role="presentation">Branch scope</div>
            {permitted.length > 1 ? <button role="menuitemradio" aria-checked={scope.value === ALL_BRANCHES} onClick={() => { choose(ALL_BRANCHES); close(); }}>All permitted branches</button> : null}
            {permitted.map((b) => <button key={b.id} role="menuitemradio" aria-checked={scope.value === b.id} onClick={() => { choose(b.id); close(); }}>{b.name}</button>)}
            <hr /><div className="menu-label" role="presentation">Only branches you are permitted to see are listed.</div>
          </>
        )}
      </Menu>
    </div>
  );
}

function MoreSheet({ open, onClose, platformAdmin }: { open: boolean; onClose: () => void; platformAdmin: boolean }) {
  const href = useScopedHref();
  const { state, session, scope } = useWorkspace();
  const router = useRouter();
  const url = useUrlState();
  const permitted = state.branches.filter((b) => session.branchIds.includes(b.id));
  const signOut = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); };
  return (
    <Dialog open={open} onClose={onClose} title="Menu" size="w480">
      <nav aria-label="All destinations" className="stack-sm">
        {NAV.map((item) => <Link key={item.key} href={href(item.href)} className="nav-link" onClick={onClose} style={{ fontSize: 15 }}><Icon name={item.icon} />{item.label}</Link>)}
      </nav>
      <hr className="divider" />
      <div className="field"><label htmlFor="mobile-branch">Branch scope</label>
        <select id="mobile-branch" className="select" value={scope.value} onChange={(e) => { url.set({ branch: e.target.value === defaultBranchOf(state) ? null : e.target.value, cursor: null }); }}>
          {permitted.length > 1 ? <option value={ALL_BRANCHES}>All permitted branches</option> : null}
          {permitted.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <Link href="/app/settings/security" className="btn" onClick={onClose}>Account and security</Link>
      <a href="/" className="btn">Public showroom</a>
      <Link href="/install" className="btn" onClick={onClose}>Install app</Link>
      {platformAdmin ? <Link href="/admin" className="btn" onClick={onClose}><Icon name="shield" size={18} />VandLabs admin console</Link> : null}
      <Button onClick={signOut}><Icon name="logout" size={18} />Sign out</Button>
    </Dialog>
  );
}

export function Shell({ children, platformAdmin = false }: { children: ReactNode; platformAdmin?: boolean }) {
  const { state, session, scope, demoState } = useWorkspace();
  const pathname = usePathname();
  const href = useScopedHref();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const key = activeKey(pathname);
  const counts = alertCounts(alertsFor(state, scope.ids));
  const urgent = counts.critical + counts.overdue;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); }
      else if (event.key === "/" && !typing && !event.ctrlKey && !event.metaKey) { event.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Route changes restore useful focus: the new page heading.
  useEffect(() => { const handle = window.setTimeout(() => document.getElementById("page-title")?.focus({ preventScroll: true }), 50); return () => window.clearTimeout(handle); }, [pathname]);

  const signOut = async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); };
  const bottom = NAV.filter((n) => ["overview", "market", "inventory", "leads"].includes(n.key));

  return (
    <ToastProvider>
      <LiveEffects />
      <div className="app">
        <aside className="rail" aria-label="Workspace">
          <Link href={href("/app/overview")} className="brand" aria-label="VandLabs Command Centre"><Brand sub /></Link>
          <nav aria-label="Primary">
            {NAV.map((item) => (
              <Link key={item.key} href={href(item.href)} className="nav-link" aria-current={key === item.key ? "page" : undefined} aria-label={item.label}>
                <Icon name={item.icon} /><span className="nav-label label-text">{item.label}</span>
                {item.key === "alerts" && urgent > 0 ? <span className="nav-badge" aria-label={`${urgent} urgent`}>{urgent}</span> : null}
              </Link>
            ))}
          </nav>
          <div className="rail-foot">
            <a href="/" className="btn btn-block">Public showroom</a>
            <Link href="/install" className="btn btn-block">Install app</Link>
            <div className="who"><strong>{state.tenant.name}</strong><span>{ROLE_LABEL[session.role]}{demoState === "empty" ? " / Empty-state preview" : ""}</span></div>
            {platformAdmin ? <Link href="/admin" className="btn btn-block"><Icon name="shield" size={18} /><span className="label">VandLabs admin</span></Link> : null}
            <Button onClick={() => setHelpOpen(true)} className="btn-block"><Icon name="help" size={18} /><span className="label">Help &amp; shortcuts</span></Button>
          </div>
        </aside>
        <header className="topbar">
          <div className="mobile-brand"><Brand sub={false} /></div>
          <SearchTrigger onOpen={() => setSearchOpen(true)} />
          <span className="spacer" />
          <button type="button" className="icon-btn only-mobile" aria-label="Search" onClick={() => setSearchOpen(true)}><Icon name="search" /></button>
          <div className="hide-mobile"><BranchSelect /></div>
          <Link href={href("/app/alerts")} className="icon-btn hide-mobile" aria-label={urgent ? `Alerts: ${urgent} urgent` : "Alerts"}><Icon name="bell" />{urgent ? <span className="dot" aria-hidden="true" /> : null}</Link>
          <button type="button" className="icon-btn hide-mobile" aria-label="Help and keyboard shortcuts" onClick={() => setHelpOpen(true)}><Icon name="help" /></button>
          <div className="hide-mobile">
            <Menu label={`Profile menu for ${session.name}`} buttonClass="avatar" text={initials(session.name)}>
              {(close) => (
                <>
                  <div className="menu-label" role="presentation">{session.name}<br />{session.email} / {ROLE_LABEL[session.role]}</div><hr />
                  <Link role="menuitem" href={href("/app/settings/security")} onClick={close}>Account and security</Link>
                  {platformAdmin ? <Link role="menuitem" href="/admin" onClick={close}>VandLabs admin console</Link> : null}
                  <button role="menuitem" onClick={signOut}><Icon name="logout" size={18} />Sign out</button>
                </>
              )}
            </Menu>
          </div>
          <button type="button" className="btn btn-ghost only-mobile accent-text" onClick={() => setMoreOpen(true)} aria-haspopup="dialog">Menu</button>
        </header>
        <main className="main" id="content" tabIndex={-1}>
          <div className="main-inner">
            <div className="meta only-mobile" style={{ marginBottom: 8 }}>{scope.label}</div>
            {children}
          </div>
        </main>
        <nav className="bottom-nav" aria-label="Primary mobile">
          {bottom.map((item) => <Link key={item.key} href={href(item.href)} aria-current={key === item.key ? "page" : undefined}><Icon name={item.icon} /><span>{item.short}</span></Link>)}
          <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-current={["pricing", "advertising", "capital", "alerts", "reports", "settings"].includes(key) ? "page" : undefined}><Icon name="menu" /><span>More</span></button>
        </nav>
      </div>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <MoreSheet platformAdmin={platformAdmin} open={moreOpen} onClose={() => setMoreOpen(false)} />
      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} title="Help and keyboard shortcuts" description="Documentation opens in a new tab. Shortcuts work on every page." footer={<Button variant="primary" onClick={() => setHelpOpen(false)}>Done</Button>}>
        <dl className="kv">{SHORTCUTS.map(([k, v]) => <div key={k}><dt>{v}</dt><dd><span className="kbd">{k}</span></dd></div>)}</dl>
        <p className="meta">Branch scope, filters, sort, tab and page cursor are held in the address bar, so Back restores them. Switching workspace clears cached private data.</p>
      </Dialog>
    </ToastProvider>
  );
}
