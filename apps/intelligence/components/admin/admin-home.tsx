"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { clearRemoteCache } from "@/lib/remote-cache";
import { formatDateTime } from "@/lib/format";
import { DEMO_ACTIVITY, DEMO_DEALERSHIPS, DEMO_PLANS, type DemoDealership } from "@/lib/admin-demo";
import { SUPPORT_EMAIL } from "@/lib/support";
import { Brand } from "../brand";
import { ThemeToggle } from "../theme";
import { Icon } from "../icons";
import { Dialog } from "../overlay";
import { TwoFactor } from "../settings/two-factor";
import { Badge, Button, EmptyState, Notice } from "../ui";
import { CreateDealership, Members, ReissueInvite, type Workspace } from "./admin-console";
import { EntitlementsDialog } from "./entitlements-dialog";
import { PlatformAudit } from "./platform-audit";
import { call } from "./shared";

type Check = { key: string; group: string; label: string; status: "pass" | "warn" | "fail"; detail: string; ms?: number };
type System = {
  checkedAt: string; checks: Check[]; twoFactor: boolean;
  build: { version: string; builtAt: string; commit: string | null; commitMessage: string | null; branch: string | null; environment: string; region: string; repo: string; node: string; uptimeSeconds: number };
  tests: { name: string; files: number; tests: number }[];
  migrations: { name: string; present: boolean }[];
};
type View = "overview" | "dealerships" | "system" | "releases" | "activity" | "security";
type Row = { kind: "live"; w: Workspace } | { kind: "demo"; d: DemoDealership };

const NAV: { key: View; label: string; icon: string }[] = [
  { key: "overview", label: "Overview", icon: "grid" },
  { key: "dealerships", label: "Dealerships", icon: "store" },
  { key: "system", label: "System health", icon: "pulse" },
  { key: "releases", label: "Releases & tests", icon: "flask" },
  { key: "activity", label: "Activity & audit", icon: "chart" },
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
  const [creating, setCreating] = useState(false);
  const [people, setPeople] = useState<Workspace | null>(null);
  const [access, setAccess] = useState<Workspace | null>(null);
  const [reissue, setReissue] = useState<Workspace | null>(null);
  const [link, setLink] = useState<{ title: string; url: string; expiresAt: string } | null>(null);
  const [twoFactorOpen, setTwoFactorOpen] = useState(false);
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
  const showLink = (title: string, path: string, expiresAt: string) => setLink({ title, url: `${window.location.origin}${path}`, expiresAt });

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
  const first = name.split(" ")[0] || "there";
  // Time of day and date come from the viewer's own clock, after hydration, so the server's time zone never shows.
  const [clock, setClock] = useState<{ greet: string; date: string }>({ greet: "Welcome", date: "" });
  useEffect(() => {
    const now = new Date(), hour = now.getHours();
    setClock({ greet: hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening", date: now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }) });
  }, []);
  const greet = clock.greet;
  const demoOnly = (what: string) => setDemoNote(`${what} is shown for demonstration. Demo dealerships are not stored anywhere and cannot be changed.`);

  const card = (r: Row) => {
    const isDemo = r.kind === "demo";
    const d = isDemo ? r.d : null, w = !isDemo ? r.w : null;
    const status = d ? d.status : w!.owners ? "Active" : w!.pendingInvites ? "Setting up" : "No owner";
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
        {d ? <div className="adm-card-spark"><Spark values={d.leads14d} /><span className="meta">Leads, last 14 days</span></div> : <div className="adm-card-spark"><span className="meta">Owner: {w!.owners || "not joined yet"} · created {formatDateTime(w!.createdAt)}</span></div>}
        <footer>
          {isDemo ? (
            <><Button size="sm" onClick={() => demoOnly("Plan and access")}>Plan and access</Button><Button size="sm" onClick={() => demoOnly("People")}>People</Button></>
          ) : (
            <>
              <Button size="sm" onClick={() => setAccess(w!)}>Plan and access</Button>
              <Button size="sm" onClick={() => setPeople(w!)}>People</Button>
              {w!.members === 0 ? <Button size="sm" onClick={() => setReissue(w!)}>New setup link</Button> : null}
            </>
          )}
        </footer>
      </article>
    );
  };

  const lockedPanel = (what: string) => (
    <div className="adm-locked">
      <Icon name="shield" size={22} />
      <div><strong>{what} are locked</strong><p className="meta">Real dealership data needs two-factor login on your account. It takes about two minutes.</p></div>
      <Button variant="primary" size="sm" onClick={() => setTwoFactorOpen(true)}>Turn on two-factor</Button>
    </div>
  );

  return (
    <div className="adm">
      <aside className="adm-side" aria-label="Admin navigation">
        <div className="adm-brand"><Brand sub={false} /><span className="adm-pill">Admin</span></div>
        <nav className="adm-nav">
          {NAV.map((n) => (
            <button key={n.key} type="button" className={view === n.key ? "on" : ""} aria-current={view === n.key ? "page" : undefined} onClick={() => setView(n.key)}>
              <Icon name={n.icon} size={18} /><span>{n.label}</span>
              {n.key === "system" && health !== null ? <em className={health >= 85 ? "good" : health >= 60 ? "warn" : "bad"}>{health}</em> : null}
            </button>
          ))}
        </nav>
        <div className={`adm-sec ${locked ? "off" : "on"}`}>
          <Icon name="shield" size={18} />
          <div><strong>Two-factor {locked ? "off" : "on"}</strong><span>{locked ? "Real dealership data is locked" : "Full access"}</span></div>
          {locked ? <Button size="sm" variant="primary" onClick={() => setTwoFactorOpen(true)}>Turn on</Button> : null}
        </div>
        <div className="adm-side-foot">
          <Link href="/app/overview" className="btn btn-sm btn-block"><Icon name="grid" size={16} />My workspace</Link>
          <Button size="sm" className="btn-block" onClick={signOut}><Icon name="logout" size={16} />Sign out</Button>
          <a className="meta" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </div>
      </aside>

      <main className="adm-main" id="content" tabIndex={-1}>
        <header className="adm-head">
          <div>
            <p className="adm-kicker">VandLabs platform{clock.date ? ` · ${clock.date}` : ""}</p>
            <h1 className="adm-title" id="page-title">{view === "overview" ? `${greet}, ${first}` : NAV.find((n) => n.key === view)!.label}</h1>
            <p className="muted">Signed in as {email}. {view === "overview" ? "Everything on the platform, at a glance." : ""}</p>
          </div>
          <div className="adm-head-actions">
            <ThemeToggle />
            <label className="adm-switch"><input type="checkbox" checked={demo} onChange={(e) => toggleDemo(e.target.checked)} /><span aria-hidden="true" /><span>Demo data</span></label>
            <Button variant="primary" onClick={() => (locked ? setTwoFactorOpen(true) : setCreating(true))}><Icon name="plus" size={18} />Add dealership</Button>
          </div>
        </header>

        {demo ? <div className="adm-demo-banner" role="note"><Badge tone="warn">DEMO DATA</Badge><span>Cards and figures marked DEMO are fictional, for demonstrations. They are not stored and never mix with real dealerships, which are marked LIVE.</span><button type="button" className="link-btn" onClick={() => toggleDemo(false)}>Hide demo data</button></div> : null}
        {demoNote ? <Notice tone="accent" role="status"><span className="spread">{demoNote}<button type="button" className="link-btn" onClick={() => setDemoNote("")}>OK</button></span></Notice> : null}
        {link ? (
          <Notice tone="accent" role="alert">
            <div className="stack-sm"><strong>{link.title}</strong><span>Send this link to the owner. It works once and expires {formatDateTime(link.expiresAt)}. It is not shown again.</span><code style={{ wordBreak: "break-all" }}>{link.url}</code>
              <span className="row-flex"><Button size="sm" onClick={() => void navigator.clipboard?.writeText(link.url)}>Copy link</Button><Button size="sm" onClick={() => setLink(null)}>Done</Button></span></div>
          </Notice>
        ) : null}
        {wsError ? <Notice tone="danger" role="alert">{wsError}</Notice> : null}

        {view === "overview" ? (
          <div className="adm-stack">
            <section className="adm-hero" aria-label="Platform totals">
              <div className="adm-kpis">
                <div className="adm-kpi"><span>Dealerships</span><strong>{rows.length}</strong><em>{(workspaces ?? []).length} live{demo ? ` · ${DEMO_DEALERSHIPS.length} demo` : ""}</em></div>
                <div className="adm-kpi"><span>Cars in stock</span><strong>{sum((r) => val(r, "vehicles")).toLocaleString("en-IN")}</strong><em>{sum((r) => val(r, "published")).toLocaleString("en-IN")} live in showrooms</em></div>
                <div className="adm-kpi"><span>Leads</span><strong>{sum((r) => val(r, "leads")).toLocaleString("en-IN")}</strong><em>All dealerships</em></div>
                <div className="adm-kpi"><span>People with access</span><strong>{sum((r) => val(r, "members")).toLocaleString("en-IN")}</strong><em>Active memberships</em></div>
                <div className="adm-kpi"><span>Monthly revenue {demo ? <Badge tone="warn">DEMO</Badge> : null}</span><strong>{mrr === null ? "—" : inr(mrr)}</strong><em>{mrr === null ? "Billing is not connected yet" : "Active demo plans"}</em></div>
              </div>
              <Ring value={health} label="System health" />
            </section>
            {locked ? lockedPanel("Live dealerships") : null}
            <section aria-labelledby="ov-deal">
              <div className="spread adm-sec-head"><h2 className="h3" id="ov-deal">Dealerships</h2><button type="button" className="link-btn" onClick={() => setView("dealerships")}>See all {rows.length}</button></div>
              {rows.length ? <div className="adm-grid">{rows.slice(0, 6).map(card)}</div> : <EmptyState title="No dealerships yet">Add the first dealership, or switch on Demo data to show the console.</EmptyState>}
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
            {locked ? lockedPanel("Live dealerships") : null}
            {filtered.length ? <div className="adm-grid">{filtered.map(card)}</div> : <EmptyState title="No dealerships match">Try another search.</EmptyState>}
            <p className="meta">Dealer owners invite their own staff from Settings, Team inside their workspace. Every change made here is written to that dealership&rsquo;s audit log.</p>
          </div>
        ) : null}

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
              <div className="card"><h2 className="h3">Your two-factor login</h2><TwoFactor onEnabled={() => router.refresh()} /></div>
              <div className="card">
                <h2 className="h3">Platform safeguards</h2>
                <ul className="adm-gates">
                  {[
                    ["Per-dealership isolation", "Row-level security in PostgreSQL; the app's database role cannot bypass it"],
                    ["Two-factor for dealership data", "The admin console shows real dealerships only with two-factor on"],
                    ["Password confirmation for changes", "Creating dealerships, plans, suspensions and setup links need a fresh password"],
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

      {twoFactorOpen ? (
        <Dialog open onClose={() => setTwoFactorOpen(false)} title="Turn on two-factor login" description="Unlocks real dealership data in the admin console. Use any authenticator app." footer={<Button onClick={() => setTwoFactorOpen(false)}>Close</Button>}>
          <TwoFactor onEnabled={() => { setTwoFactorOpen(false); router.refresh(); }} />
        </Dialog>
      ) : null}
      {creating ? <CreateDealership onClose={() => setCreating(false)} onCreated={(path, expiresAt) => { setCreating(false); showLink("Dealership created", path, expiresAt); void loadWorkspaces(); }} /> : null}
      {access ? <EntitlementsDialog tenantId={access.tenantId} name={access.dealership} onClose={() => setAccess(null)} onSaved={() => undefined} /> : null}
      {reissue ? <ReissueInvite workspace={reissue} onClose={() => setReissue(null)} onDone={(path, expiresAt) => { setReissue(null); showLink("New owner setup link", path, expiresAt); void loadWorkspaces(); }} /> : null}
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
