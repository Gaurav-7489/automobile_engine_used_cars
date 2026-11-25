"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { clearRemoteCache } from "@/lib/remote-cache";
import { formatDateTime } from "@/lib/format";
import { DEMO_ACTIVITY, DEMO_DEALERSHIPS, DEMO_PLANS, type DemoDealership } from "@/lib/admin-demo";
import { SUPPORT_EMAIL } from "@/lib/support";
import { BrandMark } from "../brand";
import { ThemeToggle } from "../theme";
import { Icon } from "../icons";
import { Dialog } from "../overlay";
import { Badge, Button, EmptyState, Notice } from "../ui";
import { AccessRequests, CreateDealership, Members, ReissueInvite, WebsiteLinks, type Workspace } from "./admin-console";
import { EntitlementsDialog } from "./entitlements-dialog";
import { PlatformAudit } from "./platform-audit";
import { HealthReview } from "./health-review";
import { call } from "./shared";
import "./admin-dashboard.css";

type Check = { key: string; group: string; label: string; status: "pass" | "warn" | "fail"; detail: string; ms?: number };
type System = {
  checkedAt: string; checks: Check[]; twoFactor: boolean;
  build: { version: string; builtAt: string; commit: string | null; commitMessage: string | null; branch: string | null; environment: string; region: string; repo: string; node: string; uptimeSeconds: number };
  tests: { name: string; files: number; tests: number }[];
  migrations: { name: string; present: boolean }[];
};
type View = "overview" | "dealerships" | "inventory" | "health" | "system" | "releases" | "activity" | "security";
type Row = { kind: "live"; w: Workspace } | { kind: "demo"; d: DemoDealership };

const NAV: { key: View; label: string; icon: string }[] = [
  { key: "overview", label: "Overview", icon: "grid" },
  { key: "dealerships", label: "Dealerships", icon: "car" },
  { key: "inventory", label: "Inventory", icon: "stock" },
  { key: "health", label: "Customer health", icon: "heart" },
  { key: "system", label: "System health", icon: "pulse" },
  { key: "releases", label: "Releases & tests", icon: "flask" },
  { key: "activity", label: "Activity & audit", icon: "list" },
  { key: "security", label: "Security", icon: "shield" },
];
const SUITE_LABEL: Record<string, string> = { security: "Security", database: "Database", intelligence: "Intelligence engine", "intelligence-prod": "Live workspace (PostgreSQL)", "product-ui": "Product UI", cloudflare: "Cloudflare build", unified: "Browser: sign-in and boundaries", "local-stack": "Browser: accessibility, visual, flows" };
const DEMO_KEY = "vl-admin-demo";
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * 100},${28 - (v / max) * 26}`).join(" ");
  return <svg className="adm-spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points={`0,30 ${pts} 100,30`} className="area" /><polyline points={pts} className="line" /></svg>;
}

function Ring({ value, label }: { value: number | null; label: string }) {
  const v = value ?? 0, r = 36, c = 2 * Math.PI * r;
  const tone = value === null ? "muted" : v >= 85 ? "good" : v >= 60 ? "warn" : "bad";
  return (
    <div className={`adm-ring ${tone}`} role="img" aria-label={`${label}: ${value === null ? "checking" : `${v} out of 100`}`}>
      <svg viewBox="0 0 88 88"><circle cx="44" cy="44" r={r} className="track" /><circle cx="44" cy="44" r={r} className="value" strokeDasharray={`${(v / 100) * c} ${c}`} /></svg>
      <div><strong>{value === null ? "…" : v}</strong><span>{label}</span></div>
    </div>
  );
}

const statusTone = (s: Check["status"]) => (s === "pass" ? "accent" : s === "warn" ? "warn" : "danger") as "accent" | "warn" | "danger";

export function AdminConsole({ name, email, locked }: { name: string; email: string; locked: boolean }) {
  const router = useRouter();
  const [view, setView] = useState<View>("overview");
  const [demo, setDemo] = useState(true);
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [wsError, setWsError] = useState("");
  const [system, setSystem] = useState<System | null>(null);
  const [checking, setChecking] = useState(false);
  const [query, setQuery] = useState("");
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [people, setPeople] = useState<Workspace | null>(null);
  const [access, setAccess] = useState<Workspace | null>(null);
  const [reissue, setReissue] = useState<Workspace | null>(null);
  const [assigned, setAssigned] = useState<{ title: string; email: string; url: string } | null>(null);
  const [website, setWebsite] = useState<Workspace | null>(null);
  const [demoNote, setDemoNote] = useState("");

  useEffect(() => { try { const v = localStorage.getItem(DEMO_KEY); if (v !== null) setDemo(v === "1"); } catch { /* default on */ } }, []);
  const toggleDemo = (v: boolean) => { setDemo(v); try { localStorage.setItem(DEMO_KEY, v ? "1" : "0"); } catch { /* per-visit only */ } };

  const loadWorkspaces = useCallback(async () => {
    if (locked) return;
    const r = await call<{ workspaces: Workspace[] }>("/api/admin/workspaces");
    if (r.ok) { setWorkspaces(r.data.workspaces); setWsError(""); } else setWsError(r.data.error?.message ?? "Dealerships could not be loaded.");
  }, [locked]);
  const loadSystem = useCallback(async () => {
    setChecking(true);
    const r = await call<System>("/api/admin/system");
    setChecking(false);
    if (r.ok) setSystem(r.data);
  }, []);
  useEffect(() => { void loadWorkspaces(); void loadSystem(); }, [loadWorkspaces, loadSystem]);

  const signOut = async () => { await fetch("/api/auth/logout", { method: "POST" }); clearRemoteCache(); router.push("/login"); router.refresh(); };
  const showAssigned = (title: string, email: string, url: string) => setAssigned({ title, email, url });
  // Admin data needs a Google-authenticated session; a legacy password session is sent through Google sign-in.
  const signInWithGoogle = () => { window.location.href = "/api/auth/sso/google?returnTo=/admin"; };

  const rows: Row[] = useMemo(() => [
    ...(workspaces ?? []).map((w) => ({ kind: "live" as const, w })),
    ...(demo ? DEMO_DEALERSHIPS.map((d) => ({ kind: "demo" as const, d })) : []),
  ], [workspaces, demo]);
  const nameOf = (r: Row) => (r.kind === "live" ? r.w.dealership : r.d.dealership);
  const filtered = rows.filter((r) => !query.trim() || `${nameOf(r)} ${r.kind === "live" ? r.w.organization : `${r.d.organization} ${r.d.city}`}`.toLowerCase().includes(query.trim().toLowerCase()));
  const sum = (pick: (r: Row) => number) => rows.reduce((n, r) => n + pick(r), 0);
  const val = (r: Row, k: "vehicles" | "published" | "leads" | "members" | "locations") => (r.kind === "live" ? Number(r.w[k]) : r.d[k]);
  const health = system ? Math.round((system.checks.reduce((n, c) => n + (c.status === "pass" ? 1 : c.status === "warn" ? 0.6 : 0), 0) / Math.max(1, system.checks.length)) * 100) : null;
  const mrr = demo ? DEMO_DEALERSHIPS.filter((d) => d.status === "Active").reduce((n, d) => n + DEMO_PLANS[d.plan], 0) : null;
  const totalTests = (system?.tests ?? []).reduce((n, s) => n + s.tests, 0);
  const displayName = name.trim() || "VandLabs";
  const initials = displayName === "VandLabs" ? "VL" : displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const openRequests = () => { setRequestsOpen(true); setView("dealerships"); };
  // Use the administrator's local time after hydration.
  const [greet, setGreet] = useState("Welcome");
  useEffect(() => {
    const hour = new Date().getHours();
    setGreet(hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");
  }, []);
  const demoOnly = (what: string) => setDemoNote(`${what} is shown for demonstration. Demo dealerships are not stored anywhere and cannot be changed.`);

  const card = (r: Row) => {
    const isDemo = r.kind === "demo";
    const d = isDemo ? r.d : null, w = !isDemo ? r.w : null;
    const status = d ? d.status : w!.owners ? "Active" : w!.pendingOwner || w!.pendingInvites ? "Waiting for owner sign-in" : "No owner";
    return (
      <article key={isDemo ? d!.tenantId : w!.tenantId} className={`adm-card ${isDemo ? "demo" : "live"}`}>
        <header>
          <div className="adm-avatar" aria-hidden="true">{nameOf(r).split(" ").map((x) => x[0]).slice(0, 2).join("")}</div>
          <div className="adm-card-name"><strong>{nameOf(r)}</strong><span className="meta">{d ? `${d.city} · ${d.organization}` : w!.organization}</span></div>
          {isDemo ? <Badge tone="warn">DEMO</Badge> : <Badge tone="accent">LIVE</Badge>}
        </header>
        <div className="adm-card-tags">
          <span className={`adm-status s-${status.replace(/\s/g, "-").toLowerCase()}`}>{status}</span>
          {d ? <span className="chip">{d.plan}{DEMO_PLANS[d.plan] ? ` · ${inr(DEMO_PLANS[d.plan])}/mo` : ""}</span> : null}
          <span className="chip">{val(r, "locations")} branch{val(r, "locations") === 1 ? "" : "es"}</span>
        </div>
        <dl className="adm-card-stats">
          <div><dt>Stock</dt><dd>{val(r, "vehicles")}</dd></div>
          <div><dt>Live</dt><dd>{val(r, "published")}</dd></div>
          <div><dt>Leads</dt><dd>{val(r, "leads")}</dd></div>
          <div><dt>People</dt><dd>{val(r, "members")}</dd></div>
        </dl>
        {d ? <div className="adm-card-spark"><Spark values={d.leads14d} /><span className="meta">Leads, last 14 days</span></div> : <div className="adm-card-spark"><span className="meta">Owner: {w!.owners || (w!.pendingOwner ? `${w!.pendingOwner} (not signed in yet)` : "not assigned")} · created {formatDateTime(w!.createdAt)}</span></div>}
        <footer>
          {isDemo ? (
            <><Button size="sm" onClick={() => demoOnly("Plan and access")}>Plan and access</Button><Button size="sm" onClick={() => demoOnly("People")}>People</Button></>
          ) : (
            <>
              <Button size="sm" onClick={() => setAccess(w!)}>Plan and access</Button>
              <Button size="sm" onClick={() => setPeople(w!)}>People</Button>
              <Button size="sm" onClick={() => setWebsite(w!)}>Website</Button>
              {w!.members === 0 ? <Button size="sm" onClick={() => setReissue(w!)}>Change owner</Button> : null}
            </>
          )}
        </footer>
      </article>
    );
  };

  const lockedPanel = (what: string) => (
    <div className="adm-locked">
      <Icon name="shield" size={22} />
      <div><strong>{what} are locked</strong><p className="meta">Real dealership data needs a Google sign-in. Your Google account&apos;s 2-Step Verification protects it.</p></div>
      <Button variant="primary" size="sm" onClick={signInWithGoogle}>Continue with Google</Button>
    </div>
  );

  return (
    <div className="adm adm-redesign">
      <aside className="adm-side" aria-label="Admin navigation">
        <div className="adm-brand"><BrandMark size={32} /><strong>VANDLABS</strong><span>Automobile<br />Intelligence</span></div>
        <nav className="adm-nav">
          {NAV.map((n) => (
            <button key={n.key} type="button" className={view === n.key ? "on" : ""} aria-current={view === n.key ? "page" : undefined} onClick={() => setView(n.key)}>
              <Icon name={n.icon} size={23} /><span>{n.label}</span>
            </button>
          ))}
        </nav>
        <details className="adm-account">
          <summary><span className="adm-profile-mark" aria-hidden="true">{initials}</span><span><strong>{displayName}</strong><small>Super Admin</small></span><Icon name="chevronDown" size={16} /></summary>
          <div className="adm-side-foot">
            <small>{email}</small>
            <span>{locked ? "Google sign-in needed" : "Signed in with Google"}</span>
            {locked ? <Button size="sm" onClick={signInWithGoogle}>Continue with Google</Button> : null}
            <Link href="/app/overview" className="btn btn-sm btn-block">My workspace</Link>
            <Button size="sm" className="btn-block" onClick={signOut}>Sign out</Button>
            <a className="meta" href={`mailto:${SUPPORT_EMAIL}`}>Contact support</a>
          </div>
        </details>
      </aside>

      <main className="adm-main" id="content" tabIndex={-1}>
        <div className="adm-top">
          <form className="adm-search" onSubmit={(event) => { event.preventDefault(); setView("dealerships"); }}>
            <button type="submit" aria-label="Search dealerships"><Icon name="search" size={18} /></button>
            <input type="search" placeholder="Search dealerships…" aria-label="Search dealerships from any admin view" value={query} onChange={(event) => setQuery(event.target.value)} />
          </form>
          <button type="button" className="adm-notifications" aria-label="Review access requests" onClick={openRequests}><Icon name="bell" size={21} /></button>
          <ThemeToggle />
          <label className="adm-switch"><input type="checkbox" checked={demo} onChange={(e) => toggleDemo(e.target.checked)} /><span aria-hidden="true" /><span>Demo data</span></label>
        </div>
        <header className={`adm-head ${view === "overview" ? "adm-dashboard-hero" : ""}`}>
          <div className="adm-heading">
            <p className="adm-eyebrow">Platform administration</p>
            <h1 className="adm-title" id="page-title">{view === "overview" ? <>{greet},<br /><em>{displayName}</em></> : NAV.find((n) => n.key === view)!.label}</h1>
            {view === "overview" ? <p className="muted">Manage dealerships, inventory and platform operations.</p> : null}
          </div>
          <Button variant="primary" className="adm-add" onClick={() => (locked ? signInWithGoogle() : setCreating(true))}><Icon name="plus" size={18} />Add dealership</Button>
        </header>

        {demo ? <div className="adm-demo-banner" role="note"><Badge tone="warn">DEMO DATA</Badge><span>Cards and figures marked DEMO are fictional, for demonstrations. They are not stored and never mix with real dealerships, which are marked LIVE.</span><button type="button" className="link-btn" onClick={() => toggleDemo(false)}>Hide demo data</button></div> : null}
        {demoNote ? <Notice tone="accent" role="status"><span className="spread">{demoNote}<button type="button" className="link-btn" onClick={() => setDemoNote("")}>OK</button></span></Notice> : null}
        {assigned ? <OwnerAssigned info={assigned} onDone={() => setAssigned(null)} /> : null}
        {wsError ? <Notice tone="danger" role="alert">{wsError}</Notice> : null}

        {view === "overview" ? (
          <div className="adm-stack">
            <section className="adm-dashboard-kpis" aria-label="Platform totals">
              {([
                { label: "Dealerships", icon: "store", count: rows.length, note: `${(workspaces ?? []).length} live${demo ? ` · ${DEMO_DEALERSHIPS.length} demo` : ""}`, target: "dealerships" },
                { label: "Cars in stock", icon: "car", count: sum((r) => val(r, "vehicles")), note: `${sum((r) => val(r, "published"))} published`, target: "inventory" },
                { label: "Leads", icon: "users", count: sum((r) => val(r, "leads")), note: "All dealerships", target: "dealerships" },
                { label: "People with access", icon: "user", count: sum((r) => val(r, "members")), note: "Active memberships", target: "dealerships" },
              ] as const).map((metric) => (
                <button key={metric.label} className="adm-metric" type="button" onClick={() => setView(metric.target)}>
                  <span className="adm-metric-heading"><Icon name={metric.icon} size={24} />{metric.label}</span>
                  <span className="adm-metric-body"><strong>{workspaces === null && !demo ? "—" : metric.count.toLocaleString("en-IN")}</strong><span>{metric.note}</span><Icon name="arrowRight" size={17} /></span>
                </button>
              ))}
            </section>
            <div className="adm-dashboard-secondary">
              <section className="card adm-access-card" aria-labelledby="ov-access">
                <h2 id="ov-access"><Icon name="users" size={24} />Access requests</h2>
                {locked ? <Button size="sm" onClick={signInWithGoogle}>Continue with Google</Button> : <AccessRequests summary onReview={openRequests} onApproved={(email, url) => { showAssigned("Access approved", email, url); void loadWorkspaces(); }} />}
              </section>
              <section className="card adm-health-card">
                <h2><Icon name="pulse" size={24} />System health</h2>
                <div className="adm-health-body"><Ring value={health} label="System health" /><span>{health === null ? "Checking" : health >= 85 ? "Good" : health >= 60 ? "Review" : "Needs attention"}</span><button className="adm-round" type="button" aria-label="View system health" onClick={() => setView("system")}><Icon name="arrowRight" size={17} /></button></div>
              </section>
              <section className="card adm-revenue">
                <h2><Icon name="coins" size={24} />Monthly revenue {demo ? <Badge tone="warn">DEMO</Badge> : null}</h2>
                <strong>{mrr === null ? "—" : inr(mrr)}</strong>
                <p className="meta">{mrr === null ? "Billing is not connected yet" : "Active demo plans"}</p>
              </section>
            </div>
            <section className="card adm-dealership-list" aria-labelledby="ov-deal">
              <div className="spread adm-sec-head"><h2 id="ov-deal"><Icon name="store" size={24} />Your dealerships</h2><button type="button" className="link-btn" onClick={() => setView("dealerships")}>View all <Icon name="arrowRight" size={16} /></button></div>
              {rows.length ? <ul>{rows.slice(0, 4).map((row) => (
                <li key={row.kind === "live" ? row.w.tenantId : row.d.tenantId}>
                  <span className="adm-dealer-mark" aria-hidden="true"><Icon name="store" size={28} /></span>
                  <div><strong>{nameOf(row)}</strong><div className="adm-dealer-counts">
                    <span><Icon name="store" size={16} />{val(row, "locations")} branches</span>
                    <span><Icon name="car" size={16} />{val(row, "vehicles")} vehicles</span>
                    <span><Icon name="users" size={16} />{val(row, "members")} people</span>
                  </div></div>
                  <Badge tone={row.kind === "live" ? "accent" : "warn"}>{row.kind === "live" ? "Live" : "Demo"}</Badge>
                  <button type="button" className="adm-round" aria-label={`Find ${nameOf(row)} in dealerships`} onClick={() => { setQuery(nameOf(row)); setView("dealerships"); }}><Icon name="arrowRight" size={17} /></button>
                </li>
              ))}</ul> : <EmptyState title={workspaces === null && !locked ? "Loading dealerships" : "No dealerships yet"}>{locked ? "Sign in with Google to view live dealerships." : "Add a dealership to get started."}</EmptyState>}
            </section>
            <div className="adm-two">
              <section className="card" aria-labelledby="ov-health"><div className="spread adm-sec-head"><h2 className="h3" id="ov-health">System health</h2><button type="button" className="link-btn" onClick={() => setView("system")}>Details</button></div><Checks system={system} compact /></section>
              <section className="card" aria-labelledby="ov-act"><div className="spread adm-sec-head"><h2 className="h3" id="ov-act">Recent activity</h2><button type="button" className="link-btn" onClick={() => setView("activity")}>All activity</button></div>
                {demo ? <ul className="adm-feed">{DEMO_ACTIVITY.slice(0, 5).map((a, i) => <li key={i}><span className="adm-dot" /><div><strong>{a.dealership}</strong> <Badge tone="warn">DEMO</Badge><p>{a.action}</p><span className="meta">{a.actor} · {formatDateTime(a.at)}</span></div></li>)}</ul> : <p className="muted">Live activity is in Activity & audit.</p>}
              </section>
            </div>
          </div>
        ) : null}

        {view === "dealerships" ? (
          <div className="adm-stack">
            <div className="adm-toolbar"><input className="input" type="search" placeholder="Search dealerships or cities" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search dealerships" /><span className="meta">{filtered.length} shown</span></div>
            {locked ? lockedPanel("Live dealerships") : <AccessRequests showEmpty={requestsOpen} onApproved={(email, url) => { showAssigned("Access approved", email, url); void loadWorkspaces(); }} />}
            {filtered.length ? <div className="adm-grid">{filtered.map(card)}</div> : <EmptyState title="No dealerships match">Try another search.</EmptyState>}
            <p className="meta">Dealer owners invite their own staff from Settings, Team inside their workspace. Every change made here is written to that dealership&rsquo;s audit log.</p>
          </div>
        ) : null}

        {view === "inventory" ? (
          <div className="adm-stack">
            {locked ? lockedPanel("Live inventory totals") : null}
            <section className="card">
              <h2 className="h3">Inventory by dealership</h2>
              {rows.length ? <div className="table-wrap"><table className="data-table" aria-label="Inventory by dealership">
                <thead><tr><th>Dealership</th><th>Stock</th><th>Published</th></tr></thead>
                <tbody>{rows.map((row) => <tr key={row.kind === "live" ? row.w.tenantId : row.d.tenantId}><td>{nameOf(row)} {row.kind === "demo" ? <Badge tone="warn">Demo</Badge> : null}</td><td>{val(row, "vehicles")}</td><td>{val(row, "published")}</td></tr>)}</tbody>
              </table></div> : <p className="muted">{workspaces === null && !locked ? "Loading inventory totals…" : "No dealership inventory to show."}</p>}
            </section>
          </div>
        ) : null}

        {view === "health" ? (locked ? lockedPanel("Customer health") : <HealthReview />) : null}

        {view === "system" ? (
          <div className="adm-stack">
            <section className="card">
              <div className="spread adm-sec-head"><div><h2 className="h3">Live checks</h2><p className="meta">{system ? `Checked ${formatDateTime(system.checkedAt)}` : "Checking…"} · each check runs against the running deployment, not a stored status.</p></div><Button size="sm" loading={checking} loadingLabel="Checking" onClick={() => void loadSystem()}>Run checks again</Button></div>
              <Checks system={system} />
            </section>
            <section className="card">
              <h2 className="h3">Database migrations</h2>
              <ul className="adm-migrations">{(system?.migrations ?? []).map((m) => <li key={m.name} className={m.present ? "ok" : "missing"}><Icon name={m.present ? "check" : "close"} size={14} />{m.name}</li>)}</ul>
            </section>
          </div>
        ) : null}

        {view === "releases" ? (
          <div className="adm-stack">
            <section className="adm-two">
              <div className="card adm-build">
                <h2 className="h3">Running build</h2>
                <dl className="kv">
                  <div><dt>Version</dt><dd>{system?.build.version ?? "…"}</dd></div>
                  <div><dt>Commit</dt><dd>{system?.build.commit ? <a className="accent-text" href={`https://github.com/${system.build.repo}/commit/${system.build.commit}`} target="_blank" rel="noopener noreferrer">{system.build.commit.slice(0, 7)}</a> : "Local build"}{system?.build.commitMessage ? <span className="meta"> · {system.build.commitMessage}</span> : null}</dd></div>
                  <div><dt>Branch</dt><dd>{system?.build.branch ?? "—"}</dd></div>
                  <div><dt>Built</dt><dd>{system?.build.builtAt ? formatDateTime(system.build.builtAt) : "—"}</dd></div>
                  <div><dt>Environment</dt><dd style={{ textTransform: "capitalize" }}>{system?.build.environment ?? "—"} · {system?.build.region ?? ""}</dd></div>
                  <div><dt>Runtime</dt><dd>Node {system?.build.node?.replace(/^v/, "") ?? "—"} · up {system ? Math.round(system.build.uptimeSeconds / 60) : 0} min</dd></div>
                </dl>
                {system ? <div className="row-flex"><a className="btn btn-sm" href={`https://github.com/${system.build.repo}/actions`} target="_blank" rel="noopener noreferrer">CI runs on GitHub</a>{system.build.commit ? <a className="btn btn-sm" href={`https://github.com/${system.build.repo}/commit/${system.build.commit}/checks`} target="_blank" rel="noopener noreferrer">Checks for this build</a> : null}</div> : null}
                <p className="meta">Every push to main runs the Quality Gate (lint, types, security, database, engine, product, live-workspace and browser tests) before it can deploy.</p>
              </div>
              <div className="card">
                <h2 className="h3">Automated tests</h2>
                <p className="adm-bigstat"><strong>{totalTests || "…"}</strong> tests in {(system?.tests ?? []).length} suites</p>
                <ul className="adm-bars">{(system?.tests ?? []).slice().sort((a, b) => b.tests - a.tests).map((s) => (
                  <li key={s.name}><span>{SUITE_LABEL[s.name] ?? s.name}</span><div className="adm-bar"><i style={{ width: `${(s.tests / Math.max(1, ...(system?.tests ?? []).map((x) => x.tests))) * 100}%` }} /></div><em>{s.tests}</em></li>
                ))}</ul>
              </div>
            </section>
            <section className="card">
              <h2 className="h3">Release readiness</h2>
              <ul className="adm-gates">
                {[
                  ["pass", "Dealer workspace, inventory, leads, pricing, campaigns, showroom", "Built and covered by tests"],
                  ["pass", "Website enquiries to leads, enquiry emails", "Built; emails need RESEND_API_KEY"],
                  ["warn", "Google and Meta ad publishing", "Needs ad-platform developer approval"],
                  ["warn", "WhatsApp messaging from the app", "Needs a WhatsApp Business provider"],
                  ["warn", "Licensed market data (Market Radar)", "Needs a data provider contract"],
                  ["warn", "Automatic billing", "Needs Razorpay or Stripe onboarding"],
                  ["warn", "Signed desktop installers", "Needs code-signing certificates"],
                ].map(([s, a, b]) => <li key={a}><Badge tone={s === "pass" ? "accent" : "warn"}>{s === "pass" ? "Ready" : "Blocked"}</Badge><div><strong>{a}</strong><span className="meta">{b}</span></div></li>)}
              </ul>
            </section>
          </div>
        ) : null}

        {view === "activity" ? (
          <div className="adm-stack">
            {locked ? lockedPanel("The platform audit log and live activity") : <PlatformAudit dealerships={(workspaces ?? []).map((w) => ({ tenantId: w.tenantId, organization: w.organization }))} />}
            {demo ? <section className="card"><h2 className="h3">Demo activity <Badge tone="warn">DEMO</Badge></h2><ul className="adm-feed">{DEMO_ACTIVITY.map((a, i) => <li key={i}><span className="adm-dot" /><div><strong>{a.dealership}</strong><p>{a.action}</p><span className="meta">{a.actor} · {formatDateTime(a.at)}</span></div></li>)}</ul></section> : null}
          </div>
        ) : null}

        {view === "security" ? (
          <div className="adm-stack">
            <section className="adm-two">
              <div className="card stack-sm"><h2 className="h3">Your sign-in</h2><p>You sign in with Google ({email}). Keep 2-Step Verification on for this Google account: it is what protects the admin console.</p><a className="btn btn-sm" href="https://myaccount.google.com/signinoptions/two-step-verification" target="_blank" rel="noopener noreferrer">Google 2-Step Verification</a></div>
              <div className="card">
                <h2 className="h3">Platform safeguards</h2>
                <ul className="adm-gates">
                  {[
                    ["Per-dealership isolation", "Row-level security in PostgreSQL; the app's database role cannot bypass it"],
                    ["Google sign-in for dealership data", "The admin console shows real dealerships only to a Google-authenticated administrator"],
                    ["Fresh Google confirmation for changes", "Creating dealerships, plans, suspensions, owner changes and website links need Google to confirm it's you"],
                    ["Assigned identities only", "Nobody gets in by having a Google account: VandLabs assigns each owner's Google account, bound on first sign-in"],
                    ["Rate limits", "Sign-in, enquiries, photos and commands are limited per person and per dealership"],
                    ["Audit trail", "Every admin change is written to the dealership's audit log"],
                    ["Same-origin writes", "Every change is checked against the site's own origin"],
                  ].map(([a, b]) => <li key={a}><Icon name="check" size={16} /><div><strong>{a}</strong><span className="meta">{b}</span></div></li>)}
                </ul>
              </div>
            </section>
            <section className="card"><h2 className="h3">Security checks</h2><Checks system={system ? { ...system, checks: system.checks.filter((c) => c.group === "Security") } : null} /></section>
          </div>
        ) : null}
      </main>

      {creating ? <CreateDealership onClose={() => setCreating(false)} onCreated={(ownerEmail, url) => { setCreating(false); showAssigned("Dealership created", ownerEmail, url); void loadWorkspaces(); }} /> : null}
      {access ? <EntitlementsDialog tenantId={access.tenantId} name={access.dealership} onClose={() => setAccess(null)} onSaved={() => undefined} /> : null}
      {reissue ? <ReissueInvite workspace={reissue} onClose={() => setReissue(null)} onDone={(ownerEmail, url) => { setReissue(null); showAssigned("Owner changed", ownerEmail, url); void loadWorkspaces(); }} /> : null}
      {website ? <WebsiteLinks workspace={website} onClose={() => setWebsite(null)} /> : null}
      {people ? <Dialog open onClose={() => setPeople(null)} size="w960" title={`People at ${people.dealership}`} description="Suspending signs a person out everywhere at once." footer={<Button onClick={() => setPeople(null)}>Done</Button>}><Members tenantId={people.tenantId} /></Dialog> : null}
    </div>
  );
}

function Checks({ system, compact = false }: { system: System | null; compact?: boolean }) {
  if (!system) return <p className="muted">Running checks…</p>;
  const list = compact ? [...system.checks].sort((a, b) => ({ fail: 0, warn: 1, pass: 2 }[a.status] - { fail: 0, warn: 1, pass: 2 }[b.status])).slice(0, 6) : system.checks;
  const groups = compact ? [["", list] as const] : [...new Set(list.map((c) => c.group))].map((g) => [g, list.filter((c) => c.group === g)] as const);
  return (
    <div className="adm-checks">
      {groups.map(([g, items]) => (
        <div key={g || "all"}>
          {g ? <h3 className="adm-group">{g}</h3> : null}
          <ul>{items.map((c) => <li key={c.key}><span className={`adm-led ${c.status}`} aria-hidden="true" /><div><strong>{c.label}</strong><span className="meta">{c.detail}</span></div><Badge tone={statusTone(c.status)}>{c.status === "pass" ? "OK" : c.status === "warn" ? "Attention" : "Failing"}</Badge></li>)}</ul>
        </div>
      ))}
    </div>
  );
}

/** After creating a dealership: who the owner is and exactly what they do. Nothing secret is shown or sent. */
function OwnerAssigned({ info, onDone }: { info: { title: string; email: string; url: string }; onDone: () => void }) {
  const message = `Hello, your VandLabs dealership workspace is ready. Open ${info.url} and choose Continue with Google using ${info.email}. No password is needed.`;
  return (
    <section className="card adm-setup" role="alert" aria-labelledby="setup-title">
      <div className="spread"><h2 className="h3" id="setup-title">{info.title}</h2><Badge tone="accent">Google sign-in</Badge></div>
      <ol className="adm-steps">
        <li>Tell the owner the dealership is ready (the message below has everything).</li>
        <li>They open {info.url} and choose <strong>Continue with Google</strong> with <strong>{info.email}</strong>.</li>
        <li>That first sign-in links their Google account to the dealership. Any other Google account is refused.</li>
      </ol>
      <div className="row-flex">
        <a className="btn btn-primary" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"><Icon name="message" size={16} />Share on WhatsApp</a>
        <a className="btn" href={`mailto:${encodeURIComponent(info.email)}?subject=${encodeURIComponent("Your VandLabs workspace is ready")}&body=${encodeURIComponent(message)}`}><Icon name="mail" size={16} />Send by email</a>
        <Button variant="ghost" onClick={onDone}>Done</Button>
      </div>
    </section>
  );
}
