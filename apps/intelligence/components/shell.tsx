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
import { SUPPORT_EMAIL, supportMailto } from "@/lib/support";
import { navFor, ROLE_LABEL, sectionTabs, visibleNav } from "@/lib/permissions";
import { entitled } from "@/lib/entitlements";
import { ThemeToggle } from "./theme";
import { AssistantDock } from "./assistant/assistant-dock";
import { RouteLoader } from "./motion/route-loader";
import { ALL_BRANCHES } from "@/lib/fixtures/branches";
import { sumAlertCounts } from "@/lib/selectors";
import { clearRemoteCache, warm } from "@/lib/remote-cache";

/** Pointer, focus or touch on a destination starts loading its data, so it is usually ready before the click lands. */
const warmOn = (path: string) => ({ onPointerEnter: () => warm(path), onFocus: () => warm(path), onTouchStart: () => warm(path) });

const SHORTCUTS: [string, string][] = [["Ctrl / ⌘ + K", "Open global search"], ["Ctrl / ⌘ + J", "Open the assistant"], ["/", "Open global search (outside fields)"], ["↑ ↓ then Enter", "Select and open a search result"], ["Esc", "Close a dialog, drawer or menu"], ["← → Home End", "Move between tabs"], ["Tab / Shift + Tab", "Move through controls; focus is always visible"]];

/** A feature the dealership does not have: an explanation instead of a page that would only fail to load. */
function FeatureOff({ label, reason }: { label: string; reason: string }) {
  return (
    <div className="page"><div className="state-box" role="status">
      <h1 className="h2" id="page-title" tabIndex={-1}>{label} is not available</h1>
      <p className="muted">{reason}</p>
    </div></div>
  );
}

/** Sub-pages of the current section, as one glass segmented control at the top of the page. */
function SectionTabs({ section, pathname }: { section: string; pathname: string }) {
  const { state, session } = useWorkspace();
  const href = useScopedHref();
  const tabs = sectionTabs(section, session.role, state.entitlements);
  if (!tabs.length) return null;
  const current = navFor(pathname).item?.key;
  return (
    <nav className="section-tabs" aria-label="Section">
      {tabs.map((t) => <Link key={t.key} href={href(t.href)} prefetch aria-current={current === t.key ? "page" : undefined} {...warmOn(t.href)}>{t.tab}</Link>)}
    </nav>
  );
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

/** Menu items in their groups, in order, skipping empty groups. */
function groupNav<T extends { group: string }>(items: T[]): [string, T[]][] {
  const out = new Map<string, T[]>();
  for (const item of items) out.set(item.group, [...(out.get(item.group) ?? []), item]);
  return [...out.entries()];
}

function MoreSheet({ open, onClose, platformAdmin }: { open: boolean; onClose: () => void; platformAdmin: boolean }) {
  const href = useScopedHref();
  const { state, session, scope } = useWorkspace();
  const router = useRouter();
  const url = useUrlState();
  const permitted = state.branches.filter((b) => session.branchIds.includes(b.id));
  const signOut = async () => { await fetch("/api/auth/logout", { method: "POST" }); clearRemoteCache(); router.push("/login"); router.refresh(); };
  return (
    <Dialog open={open} onClose={onClose} title="Menu" size="w480">
      <nav aria-label="All destinations" className="rail-nav sheet-nav">
        {groupNav(visibleNav(session.role, state.entitlements)).map(([group, items]) => (
          <div key={group} className="nav-group" role="group" aria-label={group}>
            <span className="nav-group-label" aria-hidden="true">{group}</span>
            {items.map((item) => <Link key={item.key} href={href(item.href)} prefetch className="nav-link" onClick={onClose} {...warmOn(item.href)}><Icon name={item.icon} size={18} />{item.label}</Link>)}
          </div>
        ))}
      </nav>
      <hr className="divider" />
      <div className="field"><label htmlFor="mobile-branch">Branch scope</label>
        <select id="mobile-branch" className="select" value={scope.value} onChange={(e) => { url.set({ branch: e.target.value === defaultBranchOf(state) ? null : e.target.value, cursor: null }); }}>
          {permitted.length > 1 ? <option value={ALL_BRANCHES}>All permitted branches</option> : null}
          {permitted.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <Link href="/app/settings/security" className="btn" onClick={onClose}>Account, security and appearance</Link>
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
  const { item: navItem, section: key } = navFor(pathname);
  const gate = navItem?.feature && !entitled(state.entitlements, navItem.feature) ? navItem : null;
  const counts = sumAlertCounts(state.alertCounts, scope.ids);
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

  const signOut = async () => { await fetch("/api/auth/logout", { method: "POST" }); clearRemoteCache(); router.push("/login"); router.refresh(); };
  const allowedNav = visibleNav(session.role, state.entitlements);
  const bottom = allowedNav.filter((n) => ["overview", "market", "inventory", "leads"].includes(n.key));

  return (
    <ToastProvider>
      <LiveEffects />
      <RouteLoader />
      <div className="app">
        <aside className="rail" aria-label="Workspace">
          <Link href={href("/app/overview")} className="brand" aria-label="VandLabs, go to Overview"><Brand sub /></Link>
          <nav aria-label="Primary" className="rail-nav">
            {groupNav(allowedNav).map(([group, items]) => (
              <div key={group} className="nav-group" role="group" aria-label={group}>
                <span className="nav-group-label" aria-hidden="true">{group}</span>
                {items.map((item) => (
                  <Link key={item.key} href={href(item.href)} prefetch className="nav-link" aria-current={key === item.key ? "page" : undefined} {...warmOn(item.href)}>
                    <Icon name={item.icon} size={18} /><span className="nav-label label-text">{item.label}</span>
                    {item.key === "overview" && urgent > 0 ? <span className="nav-badge" aria-label={`${urgent} urgent`}>{urgent}</span> : null}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          <div className="rail-foot">
            <div className="who"><span className="who-mark" aria-hidden="true">{initials(state.tenant.name || "VandLabs")}</span><span className="who-text"><strong>{state.tenant.name}</strong><span>{ROLE_LABEL[session.role]}{demoState === "empty" ? " · Empty-state preview" : ""}</span></span></div>
          </div>
        </aside>
        <header className="topbar">
          <div className="mobile-brand"><Brand sub={false} /></div>
          <SearchTrigger onOpen={() => setSearchOpen(true)} />
          <span className="spacer" />
          <button type="button" className="icon-btn only-mobile" aria-label="Search" onClick={() => setSearchOpen(true)}><Icon name="search" /></button>
          <div className="hide-mobile"><BranchSelect /></div>
          <ThemeToggle />
          <Link href={href("/app/alerts")} className="icon-btn hide-mobile" aria-label={urgent ? `Alerts: ${urgent} urgent` : "Alerts"}><Icon name="bell" />{urgent ? <span className="dot" aria-hidden="true" /> : null}</Link>
          <button type="button" className="icon-btn hide-mobile" aria-label="Help and keyboard shortcuts" onClick={() => setHelpOpen(true)}><Icon name="help" /></button>
          <div className="hide-mobile">
            <Menu label={`Profile menu for ${session.name}`} buttonClass="avatar" text={initials(session.name)}>
              {(close) => (
                <>
                  <div className="menu-label" role="presentation">{session.name}<br />{session.email} · {ROLE_LABEL[session.role]}</div><hr />
                  <Link role="menuitem" href={href("/app/settings/security")} onClick={close}>Account, security and appearance</Link>
                  <Link role="menuitem" href="/showroom" onClick={close}>Public showroom</Link>
                  <Link role="menuitem" href="/install" onClick={close}>Install the app</Link>
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
            <SectionTabs section={key} pathname={pathname} />
            <div key={pathname} className="route-enter">{gate ? <FeatureOff label={gate.label} reason={state.entitlements!.features[gate.feature!].reason} /> : children}</div>
          </div>
        </main>
        <nav className="bottom-nav" aria-label="Primary mobile">
          {bottom.map((item) => <Link key={item.key} href={href(item.href)} prefetch aria-current={key === item.key ? "page" : undefined} {...warmOn(item.href)}><Icon name={item.icon} /><span>{item.short}</span></Link>)}
          <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-current={!bottom.some((b) => b.key === key) ? "page" : undefined}><Icon name="menu" /><span>More</span></button>
        </nav>
      </div>
      {entitled(state.entitlements, "assistant") ? <AssistantDock /> : null}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <MoreSheet platformAdmin={platformAdmin} open={moreOpen} onClose={() => setMoreOpen(false)} />
      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} title="Help and keyboard shortcuts" description="Documentation opens in a new tab. Shortcuts work on every page." footer={<Button variant="primary" onClick={() => setHelpOpen(false)}>Done</Button>}>
        <dl className="kv">{SHORTCUTS.map(([k, v]) => <div key={k}><dt>{v}</dt><dd><span className="kbd">{k}</span></dd></div>)}</dl>
        <p className="meta">Branch scope, filters, sort, tab and page cursor are held in the address bar, so Back restores them. Switching workspace clears cached private data.</p>
        <section className="help-contact" aria-labelledby="help-contact-title">
          <h3 className="h3" id="help-contact-title">Talk with us</h3>
          <p className="muted">Questions, feedback or a problem? Write to <a className="accent-text" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. A person reads every message.</p>
          <div className="row-flex">
            <a className="btn btn-sm" href={supportMailto("Feedback", `Page: ${typeof window === "undefined" ? "" : window.location.pathname}\n\n`)}>Send feedback</a>
            <a className="btn btn-sm" href={supportMailto("Problem report", `Page: ${typeof window === "undefined" ? "" : window.location.pathname}\nWhat happened:\n\nWhat I expected:\n`)}>Report a problem</a>
            <a className="btn btn-sm" href={supportMailto("Talk with VandLabs")}>Talk with us</a>
          </div>
        </section>
      </Dialog>
    </ToastProvider>
  );
}
