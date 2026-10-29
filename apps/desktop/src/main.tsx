import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import "./style.css";

// The desktop application is a second front end to the same private platform: the same accounts, roles, branch scope, entitlements and APIs
// as the web application. It reads the platform's own page APIs (server-paged) and sends the same workspace commands the web sends.
interface Config { apiOrigin: string; authorizeUrl: string; tokenUrl: string }
interface Shell { tenant: { name: string }; alertCounts?: Record<string, { critical: number; overdue: number }>; entitlements?: { features: Record<string, { enabled: boolean }> } }
interface Vehicle { id: string; make: string; model: string; variant: string; year: number; km: number; status: string; asking: number | null; branchId: string }
interface Lead { id: string; name: string; contactMasked: string; stage: string; source: string; owner: string; version: number; nextAction: string }
interface VehiclePage { vehicles: Vehicle[]; total: number; counts: Record<string, number> }
interface LeadPage { leads: Lead[]; total: number; stages: Record<string, number> }
interface StockPage { bands: { label: string; vehicles: number; capitalPaise: number | null }[]; rows: { stockId: string; label: string; ageDays: number; recommendations: { action: string; reason: string }[] }[]; total: number }
const STAGES = ["New", "Contacted", "Qualified", "Appointment", "Visited", "Test drive", "Negotiation", "Won", "Lost", "Nurture"];
const SECTIONS = ["Today", "Inventory", "Leads", "Stock ageing"] as const;
type Section = (typeof SECTIONS)[number];
const lakh = (paise: number | null) => (paise === null ? "—" : `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`);

function App() {
  const [config, setConfig] = useState<Config>(() => { try { const v = JSON.parse(localStorage.getItem("engine.connection.v2") || "null"); return v && typeof v.apiOrigin === "string" && typeof v.authorizeUrl === "string" && typeof v.tokenUrl === "string" ? v : { apiOrigin: "", authorizeUrl: "", tokenUrl: "" }; } catch { return { apiOrigin: "", authorizeUrl: "", tokenUrl: "" }; } });
  const [shell, setShell] = useState<Shell | null>(null);
  const [section, setSection] = useState<Section>("Today");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [vehicles, setVehicles] = useState<VehiclePage | null>(null);
  const [leads, setLeads] = useState<LeadPage | null>(null);
  const [stock, setStock] = useState<StockPage | null>(null);

  const get = useCallback(<T,>(path: string) => invoke<T>("api_request", { config, path, method: "GET", body: null }), [config]);
  const perform = useCallback(async (action: () => Promise<unknown>) => { setBusy(true); setError(""); try { await action(); } catch (e) { const text = String(e); setError(text); if (/expired|Sign in/i.test(text)) setShell(null); } finally { setBusy(false); } }, []);

  const initial = useRef(config);
  useEffect(() => {
    const c = initial.current;
    if (!c.apiOrigin || !c.tokenUrl) return;
    let live = true;
    void (async () => { setBusy(true); try { await invoke("restore_session", { config: c }); const s = await invoke<{ state: Shell }>("api_request", { config: c, path: "/api/workspace", method: "GET", body: null }); if (live) setShell(s.state); } catch (e) { if (live) setError(String(e)); } finally { if (live) setBusy(false); } })();
    return () => { live = false; };
  }, []);

  // Each section loads only its own page of data, exactly as the web application does.
  useEffect(() => {
    if (!shell) return;
    let live = true;
    const run = async () => {
      if (section === "Inventory") { const d = await get<VehiclePage>(`/api/inventory?tab=all&page=${page}&size=25${query ? `&q=${encodeURIComponent(query)}` : ""}`); if (live) setVehicles(d); }
      else if (section === "Leads") { const d = await get<LeadPage>(`/api/leads?stage=all&created=all&page=${page}&size=25${query ? `&q=${encodeURIComponent(query)}` : ""}`); if (live) setLeads(d); }
      else if (section === "Stock ageing") { const d = await get<StockPage>(`/api/stock-intelligence?page=${page}&size=25`); if (live) setStock(d); }
      else { const [v, l] = await Promise.all([get<VehiclePage>("/api/inventory?tab=available&size=1"), get<LeadPage>("/api/leads?stage=all&created=all&size=1")]); if (live) { setVehicles(v); setLeads(l); } }
    };
    void perform(run);
    return () => { live = false; };
  }, [shell, section, page, query, get, perform]);

  const discover = () => perform(async () => { const found = await invoke<Config>("discover_connection", { origin: config.apiOrigin }); setConfig(found); localStorage.setItem("engine.connection.v2", JSON.stringify(found)); setNotice("Workspace found. Sign in to continue."); });
  const login = () => perform(async () => { await invoke("login", { config }); setShell((await get<{ state: Shell }>("/api/workspace")).state); setNotice(""); });
  const logout = () => perform(async () => { await invoke("logout", { config }); setShell(null); setVehicles(null); setLeads(null); setStock(null); });
  const changeStage = (lead: Lead, stage: string) => perform(async () => {
    const r = await invoke<{ ok: boolean; error?: { message: string } }>("api_request", { config, path: "/api/workspace/commands", method: "POST", body: { commands: [{ name: "changeStage", args: [lead.id, lead.version, stage] }] } });
    if (!r.ok) throw new Error(r.error?.message ?? "The change was not saved.");
    setNotice(`${lead.name} moved to ${stage}.`);
    setLeads(await get<LeadPage>(`/api/leads?stage=all&created=all&page=${page}&size=25${query ? `&q=${encodeURIComponent(query)}` : ""}`));
  });
  const feature = (key: string) => shell?.entitlements?.features[key]?.enabled !== false;
  const go = (s: Section) => { setSection(s); setPage(1); setQuery(""); setNotice(""); };

  return (
    <div className="shell">
      <aside>
        <div className="brand">VANDLABS<span>Automobile Engine</span></div>
        <nav aria-label="Primary">{SECTIONS.filter((s) => s !== "Stock ageing" || feature("stock_intelligence")).map((s) => <button key={s} className={section === s ? "active" : ""} aria-current={section === s ? "page" : undefined} onClick={() => go(s)}>{s}</button>)}</nav>
        <small>Private dealership platform. Same account and permissions as the web.</small>
      </aside>
      <main>
        <header>
          <div><p className="eyebrow">{shell ? shell.tenant.name.toUpperCase() : "DEALER WORKSPACE"}</p><h1>{shell ? section : "Connect"}</h1></div>
          {shell ? <div className="actions"><button disabled={busy} onClick={() => void perform(async () => setShell((await get<{ state: Shell }>("/api/workspace")).state))}>Refresh</button><button disabled={busy} onClick={() => void logout()}>Sign out</button></div> : null}
        </header>
        {error ? <p role="alert" className="error">{error}</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
        {busy ? <p role="status">Working…</p> : null}
        {!shell ? (
          <section className="panel connect">
            <h2>Your dealership workspace.</h2>
            <p>Enter your workspace address. Sign-in opens in your browser, with the same password and verification as the web application.</p>
            <label>Workspace URL<input type="url" placeholder="https://your-workspace.example" value={config.apiOrigin} onChange={(e) => setConfig({ apiOrigin: e.target.value, authorizeUrl: "", tokenUrl: "" })} /></label>
            <div className="actions">
              <button disabled={busy || !config.apiOrigin} onClick={() => void discover()}>Connect workspace</button>
              <button className="primary" disabled={busy || !config.tokenUrl} onClick={() => void login()}>Sign in securely</button>
            </div>
            <small>Your session is kept in your operating system’s secure credential store and ends after 8 hours.</small>
          </section>
        ) : (
          <>
            {section === "Today" ? (
              <div className="metrics">
                {[["Available vehicles", vehicles?.counts.available], ["Leads", leads ? Object.values(leads.stages).reduce((a, b) => a + b, 0) : undefined], ["Open follow-up stages", leads ? (leads.stages["New"] ?? 0) + (leads.stages["Contacted"] ?? 0) : undefined], ["Won", leads?.stages["Won"]]].map(([label, value]) => <article key={String(label)}><span>{label}</span><strong>{value ?? "—"}</strong></article>)}
              </div>
            ) : null}
            {section === "Inventory" || section === "Leads" ? <label className="search">Search<input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} /></label> : null}
            {section === "Inventory" ? (
              <section className="panel">
                {vehicles?.vehicles.map((v) => <div className="row" key={v.id}><span><strong>{v.year} {v.make} {v.model}</strong><small>{v.id} · {v.variant} · {v.km.toLocaleString("en-IN")} km</small></span><span>{lakh(v.asking)} · {v.status}</span></div>)}
                {vehicles && !vehicles.vehicles.length ? <p>No vehicles match.</p> : null}
                <Pager page={page} total={vehicles?.total ?? 0} size={25} onPage={setPage} busy={busy} />
              </section>
            ) : null}
            {section === "Leads" ? (
              <section className="panel">
                {leads?.leads.map((l) => (
                  <div className="row" key={l.id}>
                    <span><strong>{l.name}</strong><small>{l.contactMasked} · {l.source} · {l.owner}</small></span>
                    <label>Stage<select value={l.stage} disabled={busy} onChange={(e) => void changeStage(l, e.target.value)}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></label>
                  </div>))}
                {leads && !leads.leads.length ? <p>No leads match.</p> : null}
                <Pager page={page} total={leads?.total ?? 0} size={25} onPage={setPage} busy={busy} />
              </section>
            ) : null}
            {section === "Stock ageing" ? (
              <>
                <div className="metrics">{stock?.bands.map((b) => <article key={b.label}><span>{b.label}</span><strong>{b.vehicles}</strong><small>{b.capitalPaise === null ? "" : `${lakh(b.capitalPaise)} locked`}</small></article>)}</div>
                <section className="panel">
                  {stock?.rows.map((r) => <div className="row" key={r.stockId}><span><strong>{r.label}</strong><small>{r.stockId} · {r.ageDays} days{r.recommendations.length ? ` · ${r.recommendations.map((x) => x.reason).join("; ")}` : ""}</small></span></div>)}
                  <Pager page={page} total={stock?.total ?? 0} size={25} onPage={setPage} busy={busy} />
                </section>
              </>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

function Pager({ page, total, size, onPage, busy }: { page: number; total: number; size: number; onPage: (p: number) => void; busy: boolean }) {
  if (total <= size) return null;
  return <div className="actions"><button disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>Previous</button><span>Page {page} of {Math.ceil(total / size)} · {total.toLocaleString("en-IN")} records</span><button disabled={busy || page * size >= total} onClick={() => onPage(page + 1)}>Next</button></div>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
